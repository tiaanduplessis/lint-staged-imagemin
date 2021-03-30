module.exports = {
  gifsicle: {
    interlaced: true
  },
  mozjpeg: {
    quality: 85
  },
  optipng: {
    optimizationLevel: 3
  },
  svgo: {
    plugins: [{ name: 'removeViewBox', active: false }]
  }
}
