'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { setLocalParticipant } from '@/lib/participant';
import { Button } from './ui/Button';
import type { LocalParticipant } from '@/types';

interface NicknameGateProps {
  roomId: string;
  onJoined: (participant: LocalParticipant) => void;
}

export function NicknameGate({ roomId, onJoined }: NicknameGateProps) {
  const [nickname, setNickname] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleJoin() {
    setLoading(true);
    setError(null);
    try {
      const id = crypto.randomUUID();
      const finalNickname = nickname.trim() || 'Invitado';

      const { error: insertError } = await supabase.from('participants').insert({
        id,
        room_id: roomId,
        nickname: finalNickname,
      });
      if (insertError) throw insertError;

      const participant = { id, nickname: finalNickname };
      setLocalParticipant(roomId, participant);
      onJoined(participant);
    } catch (err) {
      console.error(err);
      setError('No pudimos unirte a la sala. Probá de nuevo.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
      <h1 className="mb-2 text-2xl font-bold">Te invitaron a una sala de CineMatch 🎬</h1>
      <p className="mb-6 text-sm text-white/60">Elegí un apodo para empezar a swipear.</p>
      <input
        value={nickname}
        onChange={(e) => setNickname(e.target.value)}
        maxLength={24}
        placeholder="Tu apodo"
        onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
        className="mb-4 w-full max-w-xs rounded-xl border border-white/10 bg-brand-surface px-4 py-3 text-center text-white placeholder:text-white/30 focus:border-brand-pink focus:outline-none"
      />
      {error && <p className="mb-3 text-sm text-nope">{error}</p>}
      <Button onClick={handleJoin} disabled={loading} className="w-full max-w-xs">
        {loading ? 'Uniéndote...' : 'Unirme a la sala'}
      </Button>
    </div>
  );
}
