// Factory DOM pour les markers Mapbox — pas de React (évite les fuites mémoire)

type Palette = {
  ring: string
  inner: string
  symbol: string
  symbolColor: string
  badgeBg: string
  badgeColor: string
  halo: boolean
}

const PALETTES: Record<number, Palette> = {
  0: { ring: '#1B2838', inner: '#2C3E54', symbol: '☾', symbolColor: '#FFFDF7', badgeBg: '#1B2838', badgeColor: '#FFFDF7', halo: false },
  1: { ring: '#B8BFCC', inner: '#E2E5EB', symbol: '☀', symbolColor: '#8D99AE', badgeBg: '#8D99AE', badgeColor: '#FFFDF7', halo: false },
  2: { ring: '#A6AEC0', inner: '#EFF1F5', symbol: '☀', symbolColor: '#8D99AE', badgeBg: '#8D99AE', badgeColor: '#FFFDF7', halo: false },
  3: { ring: '#FFD976', inner: '#FFF3CC', symbol: '☀', symbolColor: '#E89F00', badgeBg: '#FFBE0B', badgeColor: '#1B2838', halo: false },
  4: { ring: '#FFBE0B', inner: '#FFE48A', symbol: '☀', symbolColor: '#B57500', badgeBg: '#FFBE0B', badgeColor: '#1B2838', halo: true },
  5: { ring: '#FF9500', inner: '#FFD976', symbol: '☀', symbolColor: '#B85700', badgeBg: '#FF6B6B', badgeColor: '#FFFDF7', halo: true },
}

export function createSunPinElement(score: number, onClick: () => void): HTMLElement {
  const s = Math.max(0, Math.min(5, Math.round(score)))
  const p = PALETTES[s]

  // Wrapper (sert d'ancrage pour le halo + pointe)
  const wrap = document.createElement('div')
  wrap.setAttribute('data-score', String(s))
  wrap.style.cssText = `
    position: relative;
    width: 38px;
    height: 46px;
    cursor: pointer;
    user-select: none;
    transition: transform 0.18s cubic-bezier(0.34, 1.56, 0.64, 1);
    will-change: transform;
  `

  // Halo (score >= 4 uniquement)
  if (p.halo) {
    const halo = document.createElement('div')
    halo.style.cssText = `
      position: absolute;
      top: -6px;
      left: -6px;
      width: 50px;
      height: 50px;
      border-radius: 50%;
      background: radial-gradient(circle, ${p.ring}55 0%, ${p.ring}00 70%);
      pointer-events: none;
      animation: pin-halo 2.4s ease-in-out infinite;
    `
    wrap.appendChild(halo)
  }

  // Cercle principal
  const circle = document.createElement('div')
  circle.style.cssText = `
    position: absolute;
    top: 0;
    left: 0;
    width: 38px;
    height: 38px;
    border-radius: 50%;
    background: radial-gradient(circle at 35% 30%, ${p.inner} 0%, ${p.ring} 100%);
    border: 2px solid ${p.ring};
    box-shadow: 0 2px 6px rgba(27,40,56,0.18), 0 8px 18px rgba(27,40,56,0.10);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 19px;
    line-height: 1;
    color: ${p.symbolColor};
    text-shadow: 0 1px 0 rgba(255,253,247,0.4);
  `
  circle.textContent = p.symbol
  wrap.appendChild(circle)

  // Badge score (en bas-droite)
  const badge = document.createElement('div')
  badge.style.cssText = `
    position: absolute;
    top: 22px;
    left: 22px;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: ${p.badgeBg};
    color: ${p.badgeColor};
    font-family: var(--font-outfit-var), system-ui, sans-serif;
    font-size: 11px;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 2px solid #FFFDF7;
    box-shadow: 0 1px 3px rgba(27,40,56,0.25);
    line-height: 1;
  `
  badge.textContent = String(s)
  wrap.appendChild(badge)

  // Pointe en bas (SVG triangle pour rendu propre)
  const tail = document.createElement('div')
  tail.style.cssText = `
    position: absolute;
    bottom: 0;
    left: 50%;
    transform: translateX(-50%);
    width: 0;
    height: 0;
    border-left: 5px solid transparent;
    border-right: 5px solid transparent;
    border-top: 9px solid ${p.ring};
    filter: drop-shadow(0 2px 2px rgba(27,40,56,0.18));
  `
  wrap.appendChild(tail)

  // Interactions
  wrap.addEventListener('click', (e) => {
    e.stopPropagation()
    onClick()
  })

  wrap.addEventListener('mouseenter', () => {
    wrap.style.transform = 'translateY(-3px) scale(1.08)'
    wrap.style.zIndex = '10'
  })

  wrap.addEventListener('mouseleave', () => {
    wrap.style.transform = ''
    wrap.style.zIndex = ''
  })

  return wrap
}
