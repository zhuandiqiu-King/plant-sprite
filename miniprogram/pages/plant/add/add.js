const api = require('../../utils/api')

// 可爱后缀列表
const CUTE_SUFFIXES = [
  '小可爱', '宝宝', '小精灵', '萌萌', '小天使',
  '豆豆', '团子', '糯糯', '乖乖', '泡泡',
  '小丸子', '咕咕', '嘟嘟', '果果', '甜甜',
]

Page({
  data: {
    mode: 'add', // add 或 edit
    plantId: null,
    name: '',
    wateringInterval: 7,
    category: 'indoor',
    note: '',
    categories: ['indoor', 'outdoor'],
    categoryNames: ['室内', '室外'],
    categoryIndex: 0,
    identifying: false,
    submitting: false,
    photoUrl: '',      // 云存储 fileID 或 base64 data URI
    photoLocalPath: '', // 本地预览临时路径
    nameError: '',     // 名称重复错误提示
  },

  // 防抖定时器
  _nameCheckTimer: null,

  onLoad(options) {
    if (options.id) {
      this.setData({ mode: 'edit', plantId: parseInt(options.id) })
      this.loadPlant(options.id)
    }
  },

  async loadPlant(id) {
    try {
      const plant = await api.get(`/api/plants/${id}`)
      this.setData({
        name: plant.name,
        wateringInterval: plant.watering_interval,
        category: plant.category,
        note: plant.note || '',
        categoryIndex: plant.category === 'outdoor' ? 1 : 0,
        photoUrl: plant.photo_url || '',
      })
    } catch (err) {
      wx.showToast({ title: '加载失败', icon: 'none' })
    }
  },

  // ---- 名称重复检查 ----

  /** 防抖检查名称是否重复 */
  checkNameDebounced(name) {
    if (this._nameCheckTimer) clearTimeout(this._nameCheckTimer)
    if (!name || !name.trim()) {
      this.setData({ nameError: '' })
      return
    }
    this._nameCheckTimer = setTimeout(() => {
      this.checkNameUnique(name.trim())
    }, 500)
  },

  /** 调用后端检查名称唯一性 */
  async checkNameUnique(name) {
    try {
      const { plantId, mode } = this.data
      let url = `/api/plants/check-name?name=${encodeURIComponent(name)}`
      if (mode === 'edit' && plantId) {
        url += `&exclude_id=${plantId}`
      }
      const res = await api.get(url)
      this.setData({ nameError: res.exists ? '该名称已存在，请换一个' : '' })
      return res.exists
    } catch (err) {
      console.warn('名称检查失败', err)
      return false
    }
  },

  // ---- 植物照片 ----

  handleChoosePhoto() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['camera', 'album'],
      sizeType: ['compressed'],
      success: (res) => {
        const tempPath = res.tempFiles[0].tempFilePath
        this.setData({ photoLocalPath: tempPath })
        this.uploadToCloud(tempPath)
      },
    })
  },

  handleRemovePhoto() {
    const oldUrl = this.data.photoUrl
    this.setData({ photoUrl: '', photoLocalPath: '' })
    // 如果是云存储 fileID，尝试清理
    if (oldUrl && oldUrl.startsWith('cloud://')) {
      wx.cloud.deleteFile({ fileList: [oldUrl] })
    }
  },

  handlePreviewPhoto() {
    const src = this.data.photoLocalPath || this.data.photoUrl
    if (src) {
      wx.previewImage({ urls: [src], current: src })
    }
  },

  // 优先上传到云存储，失败则回退到 base64
  uploadToCloud(filePath) {
    wx.showLoading({ title: '上传中...' })
    const cloudPath = `plant-photos/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`

    wx.cloud.uploadFile({
      cloudPath,
      filePath,
      config: { env: 'prod-0g02is9d648082af' },
      success: (res) => {
        this.setData({ photoUrl: res.fileID })
        wx.hideLoading()
        wx.showToast({ title: '照片已上传', icon: 'success' })
      },
      fail: (err) => {
        console.warn('云存储上传失败，回退到 base64', err)
        this.compressAndEncode(filePath)
      },
    })
  },

  // 回退方案：压缩图片并转为 base64 data URI
  compressAndEncode(filePath) {
    const that = this
    wx.getImageInfo({
      src: filePath,
      success(info) {
        const maxSize = 400
        let w = info.width
        let h = info.height
        if (w > h && w > maxSize) {
          h = Math.round(h * maxSize / w)
          w = maxSize
        } else if (h > maxSize) {
          w = Math.round(w * maxSize / h)
          h = maxSize
        }

        const canvas = wx.createOffscreenCanvas({ type: '2d', width: w, height: h })
        const ctx = canvas.getContext('2d')
        const img = canvas.createImage()
        img.onload = () => {
          ctx.drawImage(img, 0, 0, w, h)
          const dataUrl = canvas.toDataURL('image/jpeg', 0.6)
          that.setData({ photoUrl: dataUrl })
          wx.hideLoading()
        }
        img.onerror = () => {
          that.fallbackCompressPhoto(filePath)
        }
        img.src = filePath
      },
      fail() {
        that.fallbackCompressPhoto(filePath)
      },
    })
  },

  fallbackCompressPhoto(filePath) {
    wx.compressImage({
      src: filePath,
      quality: 30,
      success: (compRes) => {
        this.readFileAsDataUrl(compRes.tempFilePath)
      },
      fail: () => {
        this.readFileAsDataUrl(filePath)
      },
    })
  },

  readFileAsDataUrl(filePath) {
    const fs = wx.getFileSystemManager()
    fs.readFile({
      filePath,
      encoding: 'base64',
      success: (res) => {
        this.setData({ photoUrl: `data:image/jpeg;base64,${res.data}` })
        wx.hideLoading()
      },
      fail: () => {
        wx.hideLoading()
        this.setData({ photoLocalPath: '' })
        wx.showToast({ title: '处理照片失败', icon: 'none' })
      },
    })
  },

  // ---- 拍照识别 ----

  handleIdentify() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['camera', 'album'],
      sizeType: ['compressed'],
      success: (res) => {
        const tempPath = res.tempFiles[0].tempFilePath
        this.setData({ identifying: true })
        wx.showLoading({ title: '识别中...' })

        // 同步照片到表单预览区
        this.setData({ photoLocalPath: tempPath })
        this.uploadToCloud(tempPath)

        // 同时进行 AI 识别
        this.resizeAndIdentify(tempPath)
      },
      fail: (err) => {
        console.error('chooseMedia fail', err)
      },
    })
  },

  resizeAndIdentify(filePath) {
    const that = this
    wx.getImageInfo({
      src: filePath,
      success(info) {
        const maxSize = 400
        let w = info.width
        let h = info.height
        if (w > h && w > maxSize) {
          h = Math.round(h * maxSize / w)
          w = maxSize
        } else if (h > maxSize) {
          w = Math.round(w * maxSize / h)
          h = maxSize
        }

        const canvas = wx.createOffscreenCanvas({ type: '2d', width: w, height: h })
        const ctx = canvas.getContext('2d')
        const img = canvas.createImage()
        img.onload = () => {
          ctx.drawImage(img, 0, 0, w, h)
          const dataUrl = canvas.toDataURL('image/jpeg', 0.6)
          const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '')
          console.log('压缩后图片大小:', Math.round(base64.length / 1024), 'KB')
          that.identifyImage(base64)
        }
        img.onerror = () => {
          that.fallbackCompress(filePath)
        }
        img.src = filePath
      },
      fail() {
        that.fallbackCompress(filePath)
      },
    })
  },

  fallbackCompress(filePath) {
    wx.compressImage({
      src: filePath,
      quality: 20,
      success: (compRes) => {
        this.readAndIdentify(compRes.tempFilePath)
      },
      fail: () => {
        this.readAndIdentify(filePath)
      },
    })
  },

  readAndIdentify(filePath) {
    const fs = wx.getFileSystemManager()
    fs.readFile({
      filePath,
      encoding: 'base64',
      success: (fileRes) => {
        this.identifyImage(fileRes.data)
      },
      fail: (err) => {
        console.error('readFile fail', err)
        wx.hideLoading()
        this.setData({ identifying: false })
        wx.showToast({ title: '读取图片失败', icon: 'none' })
      },
    })
  },

  /** 随机选一个可爱后缀 */
  getRandomSuffix() {
    const idx = Math.floor(Math.random() * CUTE_SUFFIXES.length)
    return CUTE_SUFFIXES[idx]
  },

  async identifyImage(base64) {
    const sizeKB = Math.round(base64.length / 1024)
    console.log('图片大小:', sizeKB, 'KB')
    if (sizeKB > 100) {
      wx.hideLoading()
      this.setData({ identifying: false })
      wx.showModal({
        title: '图片太大',
        content: `当前图片 ${sizeKB}KB，超出限制。请选择一张更小的图片，或使用相机拍摄时离近一些。`,
        showCancel: false,
      })
      return
    }
    try {
      console.log('识别图片大小:', Math.round(base64.length / 1024), 'KB')
      const result = await api.post('/api/plants/identify', { image: base64 })

      // 给 AI 识别的名称加可爱后缀，确保名称唯一
      let finalName = result.name + this.getRandomSuffix()
      // 检查名称是否重复，重复则换后缀重试（最多 5 次）
      for (let i = 0; i < 5; i++) {
        const exists = await this.checkNameUnique(finalName)
        if (!exists) break
        finalName = result.name + this.getRandomSuffix()
      }

      this.setData({
        name: finalName,
        nameError: '',
        wateringInterval: result.watering_interval,
        category: result.category,
        note: result.description + '\n' + result.care_tips,
        categoryIndex: result.category === 'outdoor' ? 1 : 0,
      })
      wx.showToast({ title: '识别成功', icon: 'success' })
    } catch (err) {
      console.error('识别失败', err)
      wx.showToast({ title: '识别失败，请重试', icon: 'none' })
    } finally {
      wx.hideLoading()
      this.setData({ identifying: false })
    }
  },

  onNameInput(e) {
    this.setData({ name: e.detail.value })
    this.checkNameDebounced(e.detail.value)
  },

  onIntervalInput(e) {
    const val = e.detail.value
    // 允许用户清空输入框，提交时再校验
    this.setData({ wateringInterval: val === '' ? '' : (parseInt(val) || '') })
  },

  onCategoryChange(e) {
    const idx = e.detail.value
    this.setData({
      categoryIndex: idx,
      category: this.data.categories[idx],
    })
  },

  onNoteInput(e) {
    this.setData({ note: e.detail.value })
  },

  async handleSubmit() {
    const { name, wateringInterval, category, note, mode, plantId, photoUrl, nameError } = this.data
    if (!name.trim()) {
      wx.showToast({ title: '请输入植物名称', icon: 'none' })
      return
    }
    const interval = parseInt(wateringInterval)
    if (!interval || interval < 1) {
      wx.showToast({ title: '请输入有效的浇水间隔', icon: 'none' })
      return
    }
    // 名称重复时阻止提交
    if (nameError) {
      wx.showToast({ title: nameError, icon: 'none' })
      return
    }

    // 提交前再做一次同步校验
    const exists = await this.checkNameUnique(name.trim())
    if (exists) {
      wx.showToast({ title: '该名称已存在，请换一个', icon: 'none' })
      return
    }

    this.setData({ submitting: true })

    const payload = {
      name: name.trim(),
      watering_interval: interval,
      category,
      note: note || null,
      photo_url: photoUrl || null,
    }

    try {
      if (mode === 'edit') {
        await api.put(`/api/plants/${plantId}`, payload)
        wx.showToast({ title: '保存成功', icon: 'success' })
      } else {
        await api.post('/api/plants', payload)
        wx.showToast({ title: '添加成功', icon: 'success' })
      }
      setTimeout(() => wx.navigateBack(), 500)
    } catch (err) {
      wx.showToast({ title: '保存失败', icon: 'none' })
    } finally {
      this.setData({ submitting: false })
    }
  },
})
