// Factory DOM pour les markers Mapbox.
// DA CielBleu : bleu dominant, soleil = accent uniquement aux scores 4-5.
// Hit zone élargie (60×60) pour le tactile mobile.

type Palette = {
  ring: string
  inner: string
  symbol: string
  symbolColor: string
  badgeBg: string
  badgeColor: string
  halo: boolean
  haloColor: string
}

// 0 = nuit (sky-900) → 5 = plein soleil (sun-500). Les scores faibles restent
// dans la famille bleue, les scores forts virent au doré.
const PALETTES: Record<number, Palette> = {
  0: { ring: '#173c68', inner: '#1f4d80', symbol: '☾', symbolColor: '#eef7ff', badgeBg: '#173c68', badgeColor: '#eef7ff', halo: false, haloColor: '#173c68' },
  1: { ring: '#7f94aa', inner: '#bfd2e5', symbol: '☁', symbolColor: '#5f7892', badgeBg: '#5f7892', badgeColor: '#ffffff', halo: false, haloColor: '#7f94aa' },
  2: { ring: '#5ab8ff', inner: '#bfe4ff', symbol: '⛅', symbolColor: '#16324f', badgeBg: '#177fe6', badgeColor: '#ffffff', halo: false, haloColor: '#5ab8ff' },
  3: { ring: '#2f9bff', inner: '#d9efff', symbol: '☀', symbolColor: '#177fe6', badgeBg: '#2f9bff', badgeColor: '#ffffff', halo: false, haloColor: '#2f9bff' },
  4: { ring: '#ffd35a', inner: '#fff3c4', symbol: '☀', symbolColor: '#b57500', badgeBg: '#f59e0b', badgeColor: '#16324f', halo: true,  haloColor: '#ffbe0b' },
  5: { ring: '#ffbe0b', inner: '#ffe082', symbol: '☀', symbolColor: '#a85a00', badgeBg: '#16324f', badgeColor: '#ffe082', halo: true,  haloColor: '#ffbe0b' },
}

const SCORE_LABEL: Record<number, string> = {
  0: 'Nuit',
  1: 'À l’ombre',
  2: 'Peu ensoleillé',
  3: 'Bon ensoleillement',
  4: 'Très lumineux',
  5: 'Plein soleil',
}

export function createSunPinElement(score: number, onClick: () => void): HTMLElement {
  const s = Math.max(0, Math.min(5, Math.round(score)))
  const p = PALETTES[s]

  // Wrapper invisible élargi pour le tactile (60×60). Pointe = centre-bas.
  const hit = document.createElement('div')
  hit.setAttribute('data-score', String(s))
  hit.setAttribute('role', 'button')
  hit.setAttribute('tabindex', '0')
  hit.setAttribute('aria-label', `${SCORE_LABEL[s]} — score soleil ${s} sur 5`)
  hit.style.cssText = `
    position: relative;
    width: 60px;
    height: 60px;
    cursor: pointer;
    user-select: none;
    -webkit-tap-highlight-color: transparent;
    display: flex;
    align-items: flex-end;
    justify-content: center;
  `

  const wrap = document.createElement('div')
  wrap.style.cssText = `
    position: relative;
    width: 38px;
    height: 46px;
    transition: transform 0.18s cubic-bezier(0.34, 1.56, 0.64, 1);
    will-change: transform;
    pointer-events: none;
  `

  if (p.halo) {
    const halo = document.createElement('div')
    halo.style.cssText = `
      position: absolute;
      top: -6px;
      left: -6px;
      width: 50px;
      height: 50px;
      border-radius: 50%;
      background: radial-gradient(circle, ${p.haloColor}66 0%, ${p.haloColor}00 70%);
      pointer-events: none;
      animation: pin-halo 2.4s ease-in-out infinite;
    `
    wrap.appendChild(halo)
  }

  const circle = document.createElement('div')
  circle.style.cssText = `
    position: absolute;
    top: 0;
    left: 0;
    width: 38px;
    height: 38px;
    border-radius: 50%;
    background: radial-gradient(circle at 35% 30%, ${p.inner} 0%, ${p.ring} 100%);
    border: 2px solid #ffffff;
    box-shadow: 0 2px 6px rgba(23, 60, 104, 0.22), 0 8px 18px rgba(23, 60, 104, 0.12);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 19px;
    line-height: 1;
    color: ${p.symbolColor};
  `
  circle.textContent = p.symbol
  wrap.appendChild(circle)

  // Badge chiffre — assure que le score reste lisible même daltonien
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
    border: 2px solid #ffffff;
    box-shadow: 0 1px 3px rgba(23, 60, 104, 0.30);
    line-height: 1;
  `
  badge.textContent = String(s)
  wrap.appendChild(badge)

  // Pointe en bas
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
    filter: drop-shadow(0 2px 2px rgba(23, 60, 104, 0.20));
  `
  wrap.appendChild(tail)

  hit.appendChild(wrap)

  const fire = (e: Event) => {
    e.stopPropagation()
    e.preventDefault()
    onClick()
  }
  hit.addEventListener('click', fire)
  hit.addEventListener('touchend', fire, { passive: false })
  hit.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onClick()
    }
  })

  hit.addEventListener('mouseenter', () => {
    wrap.style.transform = 'translateY(-3px) scale(1.08)'
    hit.style.zIndex = '10'
  })
  hit.addEventListener('mouseleave', () => {
    wrap.style.transform = ''
    hit.style.zIndex = ''
  })

  return hit
}
