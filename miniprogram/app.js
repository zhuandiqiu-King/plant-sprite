App({
  globalData: {},
  onLaunch() {
    wx.cloud.init({
      env: 'prod-0g02is9d648082af',
      traceUser: true,
    })
  },
})
