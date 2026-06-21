import { Config } from '@remotion/cli/config'

Config.setVideoImageFormat('jpeg')
Config.setOverwriteOutput(true)
// Qualité un cran au-dessus pour des pubs nettes.
Config.setCrf(18)
