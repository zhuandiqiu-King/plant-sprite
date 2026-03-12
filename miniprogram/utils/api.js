/**
 * 网络请求封装，通过云托管内网调用，自动带 token，401 跳登录
 */
const SERVICE_NAME = 'flask-h72v'

function request(options) {
  return new Promise((resolve, reject) => {
    const token = wx.getStorageSync('token') || ''
    const header = { 'Content-Type': 'application/json', ...options.header }
    if (token) {
      header['Authorization'] = `Bearer ${token}`
    }

    wx.cloud.callContainer({
      config: {
        env: 'prod-0g02is9d648082af',
      },
      service: SERVICE_NAME,
      path: options.url,
      method: options.method || 'GET',
      header,
      data: options.data,
      success(res) {
        if (res.statusCode === 401) {
          wx.removeStorageSync('token')
          wx.redirectTo({ url: '/pages/login/login' })
          reject(new Error('未登录'))
          return
        }
        if (res.statusCode >= 400) {
          const detail = res.data && res.data.detail ? res.data.detail : '请求失败'
          reject(new Error(detail))
          return
        }
        resolve(res.data)
      },
      fail(err) {
        console.error('callContainer fail', err)
        reject(err)
      },
    })
  })
}

function get(url) {
  return request({ url, method: 'GET' })
}

function post(url, data) {
  return request({ url, method: 'POST', data })
}

function put(url, data) {
  return request({ url, method: 'PUT', data })
}

function del(url) {
  return request({ url, method: 'DELETE' })
}

module.exports = { request, get, post, put, del }
