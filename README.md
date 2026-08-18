# CineMatch 🎬

MVP mobile-first para decidir en pareja o en grupo qué película o serie ver. Se crea una sala,
se invita por link/QR y cada participante swipea un catálogo traído de TMDB. Cuando **todos**
los participantes de la sala le dan "Like" al mismo título, aparece un modal de **Match** en
tiempo real para todos.

## Stack

- Next.js 14 (App Router) + TypeScript
- Tailwind CSS + Framer Motion (swipe gestures y animaciones)
- Supabase (Postgres + Realtime) — sin autenticación, sesiones anónimas por sala
- TMDB API v3

## 1. Requisitos

- Node.js 18.18+ (recomendado 20 LTS) y npm
- Una cuenta de [Supabase](https://supabase.com) con el proyecto ya creado
- Una API key v3 de [TMDB](https://www.themoviedb.org/settings/api)

## 2. Variables de entorno

Copiá `.env.example` a `.env.local` (ya viene creado en este repo con las credenciales del
proyecto) y completá con tus propios valores si usás otro proyecto de Supabase/TMDB:

```
NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu-anon-key
TMDB_API_KEY=tu-api-key-de-tmdb
```

`TMDB_API_KEY` **no** lleva el prefijo `NEXT_PUBLIC_` a propósito: sólo se usa del lado del
servidor, en `app/api/tmdb/route.ts`, que actúa como proxy para no exponer la key en el bundle
del cliente.

## 3. Base de datos: script SQL para Supabase

Entrá al **SQL Editor** de tu proyecto de Supabase (Project → SQL Editor → New query) y
ejecutá exactamente lo siguiente. Crea las 4 tablas, las políticas RLS, el trigger que detecta
matches automáticamente y activa las suscripciones Realtime.

> Nota: `rooms` tiene una columna `genre_ids integer[]` (no listada en el modelo básico original)
> para el filtro de géneros — ahora multi-selección — al crear la sala. Reemplaza a la vieja
> columna `genre_id` (integer, un solo género) de versiones anteriores del MVP.
> También tiene `decade integer` para el filtro opcional de década (guarda el año de inicio,
> ej. `1990` para "90s"; `null` es "todas") y `provider_ids integer[]` para el filtro de
> plataformas de streaming (Netflix, Prime Video, Max, Disney+, Paramount+, Apple TV+).
> Si ya tenías las tablas creadas y "Crear Sala" te tira un error de columna faltante
> (`genre_ids`, `decade`, `provider_ids` o `name`), corré esto:
>
> ```sql
> alter table public.rooms add column if not exists genre_ids integer[];
> alter table public.rooms add column if not exists decade integer;
> alter table public.rooms add column if not exists provider_ids integer[];
> alter table public.rooms add column if not exists name text;
> ```
>
> Y si ya tenías `matches` creada de antes (sin el toggle "Vista"/"Guardada para después"),
> corré esto — la columna guarda el estado y la policy es la que permite que cualquier
> participante lo actualice (antes `matches` sólo tenía policy de lectura, los inserts
> pasan por el trigger):
>
> ```sql
> alter table public.matches add column if not exists watched boolean not null default false;
> create policy "anyone can mark a match as watched" on public.matches
>   for update using (true) with check (true);
> ```
>
> Y si ya tenías `rooms` creada de antes (sin filtros colaborativos editables después de crear
> la sala), corré esto — `filters` guarda `{ genreIds, decade, providerIds }` como JSON;
> mientras esté en `null` (salas viejas) la app sigue usando las columnas sueltas de siempre.
> `rooms` necesita entrar a la publicación de Realtime para que el cambio de filtros de un
> participante le llegue en vivo a los demás:
>
> ```sql
> alter table public.rooms add column if not exists filters jsonb;
> create policy "any participant can update room filters" on public.rooms
>   for update using (true) with check (true);
> alter publication supabase_realtime add table public.rooms;
> ```

```sql
-- CineMatch — schema completo

create extension if not exists "pgcrypto";

-- ─────────────────────────────────────────────
-- Tablas
-- ─────────────────────────────────────────────

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  status text not null default 'active' check (status in ('active', 'closed')),
  type text not null check (type in ('movie', 'tv')),
  name text,
  genre_ids integer[],
  decade integer,
  provider_ids integer[],
  filters jsonb
);

create table if not exists public.participants (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  nickname text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.swipes (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  tmdb_id integer not null,
  vote text not null check (vote in ('like', 'dislike')),
  created_at timestamptz not null default now(),
  unique (room_id, participant_id, tmdb_id)
);

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  tmdb_id integer not null,
  created_at timestamptz not null default now(),
  watched boolean not null default false,
  unique (room_id, tmdb_id)
);

create index if not exists swipes_room_tmdb_idx on public.swipes (room_id, tmdb_id);

-- ─────────────────────────────────────────────
-- Trigger de detección de match
-- Cuando alguien da "like", si TODOS los participantes actuales de la sala
-- ya likearon ese mismo tmdb_id, se inserta una fila en `matches`
-- (idempotente gracias al unique constraint).
-- ─────────────────────────────────────────────

create or replace function public.check_for_match()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  total_participants integer;
  liked_by_count integer;
begin
  if new.vote <> 'like' then
    return new;
  end if;

  select count(*) into total_participants
  from public.participants
  where room_id = new.room_id;

  select count(distinct participant_id) into liked_by_count
  from public.swipes
  where room_id = new.room_id
    and tmdb_id = new.tmdb_id
    and vote = 'like';

  if total_participants >= 2 and liked_by_count >= total_participants then
    insert into public.matches (room_id, tmdb_id)
    values (new.room_id, new.tmdb_id)
    on conflict (room_id, tmdb_id) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_check_for_match on public.swipes;
create trigger trg_check_for_match
after insert on public.swipes
for each row execute function public.check_for_match();

-- ─────────────────────────────────────────────
-- Row Level Security
-- MVP sin autenticación: cualquier cliente con la anon key puede crear salas,
-- unirse y swipear. El acceso queda acotado por el conocimiento del room id
-- (UUID no adivinable, compartido sólo vía link/QR de invitación).
-- ─────────────────────────────────────────────

alter table public.rooms enable row level security;
alter table public.participants enable row level security;
alter table public.swipes enable row level security;
alter table public.matches enable row level security;

create policy "rooms are readable by anyone" on public.rooms
  for select using (true);
create policy "anyone can create a room" on public.rooms
  for insert with check (true);
create policy "any participant can update room filters" on public.rooms
  for update using (true) with check (true);

create policy "participants are readable by anyone" on public.participants
  for select using (true);
create policy "anyone can join a room" on public.participants
  for insert with check (true);

create policy "swipes are readable by anyone" on public.swipes
  for select using (true);
create policy "anyone can register a swipe" on public.swipes
  for insert with check (true);

create policy "matches are readable by anyone" on public.matches
  for select using (true);
-- Los inserts en `matches` sólo ocurren vía el trigger (security definer,
-- corre como owner de la tabla), por eso no se otorga policy de insert al
-- rol anon directamente.
create policy "anyone can mark a match as watched" on public.matches
  for update using (true) with check (true);

-- ─────────────────────────────────────────────
-- Realtime
-- Activa la replicación para que la app reciba eventos INSERT de nuevos
-- participantes y de matches en tiempo real, y UPDATE de filtros de sala.
-- ─────────────────────────────────────────────

alter publication supabase_realtime add table public.participants;
alter publication supabase_realtime add table public.swipes;
alter publication supabase_realtime add table public.matches;
alter publication supabase_realtime add table public.rooms;
```

## 4. Correr en local

```bash
npm install
npm run dev
```

Abrí [http://localhost:3000](http://localhost:3000). Creá una sala, copiá el link (o escaneá el
QR) y abrilo en otra pestaña/dispositivo con otro apodo para probar el swipe sincronizado y el
match en tiempo real.

## 5. Deploy en Vercel

1. Subí el repo a GitHub (`git remote add origin <url> && git push -u origin main`).
2. En [vercel.com](https://vercel.com), **Add New Project** → importá el repo.
3. En **Environment Variables**, cargá las mismas tres variables de `.env.local`
   (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `TMDB_API_KEY`).
4. Deploy. Vercel detecta Next.js automáticamente (build command `next build`, output manejado
   por el framework preset).
5. En el dashboard de Supabase, no hace falta configurar CORS extra: el cliente usa la anon key
   pública y las políticas RLS ya están abiertas para este MVP.

## Estructura del proyecto

```
app/
├── api/tmdb/route.ts        # Proxy server-side hacia TMDB (oculta la API key)
├── room/[id]/page.tsx       # Sala de swipe en tiempo real
├── page.tsx                 # Landing / crear sala
├── layout.tsx
└── globals.css
components/
├── SwipeCard.tsx             # Tarjeta animada (Framer Motion, drag + botones)
├── SwipeDeck.tsx             # Stack de tarjetas + control de índice
├── MatchModal.tsx            # Pop-up de "¡Es un Match!"
├── MatchList.tsx             # Historial de coincidencias
├── NicknameGate.tsx          # Alta de apodo para invitados que entran por link
├── RoomClient.tsx            # Orquesta datos de sala, realtime y estado de UI
└── ui/                       # Button, Spinner, QRCode
lib/
├── supabase.ts                # Cliente de Supabase (browser)
├── tmdb.ts                    # Helpers de fetch al proxy /api/tmdb
└── participant.ts             # Identidad anónima del participante en localStorage
types/
└── index.ts
```

## Alcance y decisiones del MVP

- **Sin autenticación**: cada participante es un registro en `participants` identificado por un
  UUID generado en el cliente y guardado en `localStorage` (`cinematch:participant:<roomId>`).
  No hay contraseña ni email.
- **Match = todos los participantes actuales likearon el mismo título.** Funciona para 2 o más
  personas y se calcula de forma atómica en la base de datos (trigger), evitando condiciones de
  carrera si dos personas swipean al mismo tiempo.
- **Catálogo**: se traen 2 páginas de `discover` de TMDB (populares, filtradas por tipo y
  género) y se enriquecen con duración (`runtime` / `episode_run_time`) pidiendo el detalle de
  cada título.
- Fuera de alcance (según el pedido original): login con contraseña/email, pagos, integración
  nativa con reproductores de video.
