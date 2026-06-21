import React from 'react'
import { Composition } from 'remotion'
import { VIDEO } from './lib/theme'
import { Canicule } from './ads/Canicule'
import { PointsDeau } from './ads/PointsDeau'
import { Ombre } from './ads/Ombre'

const common = {
  durationInFrames: VIDEO.durationInFrames,
  fps: VIDEO.fps,
  width: VIDEO.width,
  height: VIDEO.height,
}

export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="Canicule" component={Canicule} {...common} />
    <Composition id="PointsDeau" component={PointsDeau} {...common} />
    <Composition id="Ombre" component={Ombre} {...common} />
  </>
)
