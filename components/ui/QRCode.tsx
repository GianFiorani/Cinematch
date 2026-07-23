'use client';

import { QRCodeSVG } from 'qrcode.react';

export function QRCode({ value, size = 160 }: { value: string; size?: number }) {
  return (
    <div className="inline-block rounded-2xl bg-white p-3">
      <QRCodeSVG value={value} size={size} bgColor="#ffffff" fgColor="#0F0F14" />
    </div>
  );
}
