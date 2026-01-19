export const icons = {
  rosie: (size=24)=>`<svg width="${size}" height="${size}" viewBox="0 0 100 100" aria-hidden="true">
    <path d="M25,85 Q15,85 15,65 Q15,25 50,25 Q85,25 85,65 Q85,85 75,85 Q50,95 25,85" fill="var(--avatar-rosie)" />
    <path d="M15,65 Q10,70 15,75" stroke="var(--avatar-rosie)" stroke-width="6" stroke-linecap="round" fill="none"/>
    <path d="M85,65 Q90,70 85,75" stroke="var(--avatar-rosie)" stroke-width="6" stroke-linecap="round" fill="none"/>
    <g transform="translate(50, 55)">
      <circle cx="-10" cy="-5" r="7" fill="white" /><circle cx="-10" cy="-5" r="2.5" fill="#111827" />
      <circle cx="10" cy="-5" r="7" fill="white" /><circle cx="10" cy="-5" r="2.5" fill="#111827" />
      <path d="M-12,14 Q0,24 12,14" stroke="#111827" stroke-width="6" stroke-linecap="round" fill="none" />
    </g>
    <path d="M50 12 v-10" stroke="var(--avatar-rosie)" stroke-width="6" stroke-linecap="round"></path>
    <circle cx="50" cy="2" r="4" fill="var(--avatar-rosie)"></circle>
  </svg>`,
  avatar: (id, size=22)=>{
    const c = ({
      nasima: 'var(--avatar-nasima)',
      suhayl: 'var(--avatar-suhayl)',
      rayhaan: 'var(--avatar-rayhaan)',
      zaara: 'var(--avatar-zaara)',
      jabu: 'var(--avatar-jabu)',
      lisa: 'var(--avatar-lisa)',
      rosie: 'var(--avatar-rosie)'
    })[id] || 'var(--avatar-rosie)';
    return `<svg width="${size}" height="${size}" viewBox="0 0 100 100" aria-hidden="true">
      <path d="M25,85 Q15,85 15,65 Q15,25 50,20 Q85,25 85,65 Q85,85 75,85 Q50,95 25,85" fill="${c}" />
      <path d="M15,65 Q10,70 15,75" stroke="${c}" stroke-width="6" stroke-linecap="round" fill="none"/>
      <path d="M85,65 Q90,70 85,75" stroke="${c}" stroke-width="6" stroke-linecap="round" fill="none"/>
      <g transform="translate(50, 55)">
        <circle cx="-10" cy="-5" r="7" fill="white" /><circle cx="-10" cy="-5" r="2.5" fill="#111827" />
        <circle cx="10" cy="-5" r="7" fill="white" /><circle cx="10" cy="-5" r="2.5" fill="#111827" />
        <path d="M-10,14 Q0,20 10,14" stroke="#111827" stroke-width="6" stroke-linecap="round" fill="none" />
      </g>
    </svg>`;
  },
  mic: (size=20)=>`<svg width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">
    <path fill="currentColor" d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2Z"/>
  </svg>`,
  calendar: (size=20)=>`<svg width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">
    <path fill="currentColor" d="M7 2h2v2h6V2h2v2h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h3V2Zm15 8H2v10h20V10Z"/>
  </svg>`,
  list: (size=20)=>`<svg width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">
    <path fill="currentColor" d="M4 6h2v2H4V6Zm4 0h14v2H8V6ZM4 11h2v2H4v-2Zm4 0h14v2H8v-2ZM4 16h2v2H4v-2Zm4 0h14v2H8v-2Z"/>
  </svg>`,
  gear: (size=20)=>`<svg width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">
    <path fill="currentColor" d="M12 8.8a3.2 3.2 0 1 0 0 6.4 3.2 3.2 0 0 0 0-6.4Zm9 3.2-.02.7-2.1.7c-.16.5-.36.98-.62 1.43l1.24 1.84-.5.5-1.84-1.24c-.45.26-.93.46-1.43.62l-.7 2.1h-.7l-.7-2.1c-.5-.16-.98-.36-1.43-.62l-1.84 1.24-.5-.5 1.24-1.84c-.26-.45-.46-.93-.62-1.43l-2.1-.7v-.7l2.1-.7c.16-.5.36-.98.62-1.43L4.96 7.86l.5-.5 1.84 1.24c.45-.26.93-.46 1.43-.62l.7-2.1h.7l.7 2.1c.5.16.98.36 1.43.62l1.84-1.24.5.5-1.24 1.84c.26.45.46.93.62 1.43l2.1.7Z"/>
  </svg>`,
  chevronLeft:(size=20)=>`<svg width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M15.4 7.4 14 6l-6 6 6 6 1.4-1.4L10.8 12l4.6-4.6Z"/></svg>`,
  chevronRight:(size=20)=>`<svg width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M8.6 16.6 10 18l6-6-6-6-1.4 1.4L13.2 12 8.6 16.6Z"/></svg>`,
  check:(size=18)=>`<svg width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="m9 16.2-3.5-3.5L4 14.2 9 19l12-12-1.5-1.5L9 16.2Z"/></svg>`,
  plus:(size=18)=>`<svg width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M19 11H13V5h-2v6H5v2h6v6h2v-6h6v-2Z"/></svg>`,
  x:(size=18)=>`<svg width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M18.3 5.7 12 12l6.3 6.3-1.4 1.4L10.6 13.4 4.3 19.7 2.9 18.3 9.2 12 2.9 5.7 4.3 4.3l6.3 6.3 6.3-6.3 1.4 1.4Z"/></svg>`,

search: (size=20)=>`<svg width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">
  <path d="M10 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16Z" fill="none" stroke="currentColor" stroke-width="2"></path>
  <path d="M21 21l-4.3-4.3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"></path>
</svg>`,
};
