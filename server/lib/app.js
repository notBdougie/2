const express = require('express')
const cookieParser = require('cookie-parser')
const bodyParser = require('body-parser')
const path = require('path')
const AV = require('leanengine')
const multer = require('multer')

const cloud = require('../common/cloud')
const config = require('./config')

const app = express()

// 设置环境变量
app.set('env', config.env)

// 设置 view 引擎
app.set('views', path.join(config.root, 'views'))
app.set('view engine', 'ejs')

// 加载云代码方法
app.use(cloud)

// 启用 HTTPS（必须要放在 app.use 之后）
app.enable('trust proxy')
app.use(AV.Cloud.HttpsRedirect())

app.use(cookieParser())
app.use(bodyParser.json())
app.use(bodyParser.urlencoded({ extended: false }))

// 加载 cookieSession 以支持 AV.User 的会话状态
// 默认 cookie 5 天后过期
app.use(AV.Cloud.CookieSession({ secret: config.secret, maxAge: 3600000 * 24 * 5, fetchUser: true }))

// 接收请求头部传递的 Session Token
app.use((req, res, next) => {
    const sessionToken = req.headers['x-lc-session']
    
    if (!sessionToken || req.AV.user)
      return next()
      
    Logger.debug(`req.AV.user: ${!!req.AV.user}, sessionToken: ${!!sessionToken}`)
      
    AV.User.become(sessionToken, {
      success: function(user) {
        req.AV.user = user
        next()
      },
      error: next
    })
})

// 处理 multipart/form-data
app.use(multer().fields([]))

// 加载路由
require('./routes')(app)

// 错误处理
app.use(function(err, req, res, next) { // eslint-disable-line
  
  let statusCode, message

  const type = typeof err
  switch (type) {
    case 'number':
      statusCode = err
      message = "Internal Server Error."
      break
    case 'string':
      statusCode = 400
      message = err
      break
    default:
      statusCode = err.status || 500
      message = err.message || err
  }
  
  // 具体的错误代码详见：https://leancloud.cn/docs/error_code.html
  if(statusCode === 500)
    console.error(err.stack || ("Error: ", err))
  err.stack = undefined
  
  res.status(statusCode)
  if (req.xhr) {
    return typeof err === 'string' ? res.end(message) : res.json(err)
  } else {
    return res.render('error', {
      message: message,
      error: {}
    })
  }
})

module.exports = app