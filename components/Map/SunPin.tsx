// Factory DOM pour les markers Mapbox — pas de React ici (évite les fuites mémoire)

const SCORE_CONFIG: Record<number, { color: string; bg: string; border: string }> = {
  0: { color: '#8D99AE', bg: '#F0F2F5', border: '#C4C9D4' },
  1: { color: '#8D99AE', bg: '#F0F2F5', border: '#C4C9D4' },
  2: { color: '#8D99AE', bg: '#F5F5F5', border: '#C4C9D4' },
  3: { color: '#FFBE0B', bg: '#FFF9E6', border: '#FFD966' },
  4: { color: '#FFBE0B', bg: '#FFF3CC', border: '#FFBE0B' },
  5: { color: '#FF9500', bg: '#FFF0B0', border: '#FFBE0B' },
}

function sunIcons(score: number): string {
  if (score <= 0) return '○○○○○'
  return Array.from({ length: 5 }, (_, i) => (i < score ? '☀' : '○')).join('')
}

export function createSunPinElement(score: number, onClick: () => void): HTMLElement {
  const cfg = SCORE_CONFIG[Math.max(0, Math.min(5, score))] ?? SCORE_CONFIG[3]

  const el = document.createElement('div')
  el.setAttribute('data-score', String(score))
  el.style.cssText = `
    cursor: pointer;
    background: ${cfg.bg};
    border: 2px solid ${cfg.border};
    border-radius: 999px;
    padding: 3px 9px;
    font-size: 11px;
    color: ${cfg.color};
    font-weight: 700;
    letter-spacing: 1px;
    box-shadow: 0 2px 8px rgba(27,40,56,0.18);
    white-space: nowrap;
    transition: transform 0.15s ease, box-shadow 0.15s ease;
    user-select: none;
    position: relative;
  `

  el.textContent = sunIcons(score)

  // Flèche en bas du pin
  const arrow = document.createElement('div')
  arrow.style.cssText = `
    position: absolute;
    bottom: -7px;
    left: 50%;
    transform: translateX(-50%);
    width: 0;
    height: 0;
    border-left: 5px solid transparent;
    border-right: 5px solid transparent;
    border-top: 7px solid ${cfg.border};
  `
  el.appendChild(arrow)

  el.addEventListener('click', (e) => {
    e.stopPropagation()
    onClick()
  })

  el.addEventListener('mouseenter', () => {
    el.style.transform = 'scale(1.12)'
    el.style.boxShadow = '0 4px 14px rgba(27,40,56,0.25)'
    el.style.zIndex = '10'
  })

  el.addEventListener('mouseleave', () => {
    el.style.transform = 'scale(1)'
    el.style.boxShadow = '0 2px 8px rgba(27,40,56,0.18)'
    el.style.zIndex = ''
  })

  return el
}
