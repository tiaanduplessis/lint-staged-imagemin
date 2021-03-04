module.exports = {
  gifsicle: {
    interlaced: true
  },
  mozjpeg: {
    quality: 85
  },
  optipng: {
    optimizationLevel: 5
  },
  svgo: {
    plugins: [{ name: 'removeViewBox', active: false }]
  }
}
