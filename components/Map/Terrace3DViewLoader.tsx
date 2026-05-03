'use client'

import dynamic from 'next/dynamic'

const Terrace3DView = dynamic(() => import('./Terrace3DView'), { ssr: false })

export default Terrace3DView
