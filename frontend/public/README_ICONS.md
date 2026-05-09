# PWA 图标说明

## 所需图标文件

### 主图标
1. `pwa-192x192.png` - 192x192 像素，PNG 格式
2. `pwa-512x512.png` - 512x512 像素，PNG 格式
3. `pwa-maskable-192x192.png` - 可遮罩图标，192x192 像素
4. `pwa-maskable-512x512.png` - 可遮罩图标，512x512 像素
5. `apple-touch-icon.png` - iOS 图标，180x180 像素

### 徽章图标
1. `badge-72x72.png` - 通知徽章，72x72 像素
2. `badges/success-72x72.png` - 成功徽章
3. `badges/error-72x72.png` - 错误徽章
4. `badges/warning-72x72.png` - 警告徽章
5. `badges/alert-72x72.png` - 告警徽章
6. `badges/message-72x72.png` - 消息徽章
7. `badges/performance-72x72.png` - 性能徽章
8. `badges/update-72x72.png` - 更新徽章

### 功能图标
1. `icons/dashboard-96x96.png` - 仪表板快捷方式图标
2. `icons/task-96x96.png` - 任务快捷方式图标
3. `icons/account-96x96.png` - 账号快捷方式图标
4. `icons/task-completed.png` - 任务完成通知图标
5. `icons/task-failed.png` - 任务失败通知图标
6. `icons/account-alert.png` - 账号告警通知图标
7. `icons/system-alert.png` - 系统告警通知图标
8. `icons/message-received.png` - 消息接收通知图标
9. `icons/performance-alert.png` - 性能告警通知图标
10. `icons/update-available.png` - 更新可用通知图标

### 其他资源
1. `favicon.ico` - 网站图标，32x32 像素
2. `masked-icon.svg` - 遮罩图标，SVG 格式
3. `screenshots/desktop.png` - 桌面截图，1920x1080 像素
4. `screenshots/mobile.png` - 移动端截图，1080x1920 像素
5. `sounds/notification.mp3` - 通知声音

## 图标生成指南

### 使用工具生成
1. **Favicon 生成器**: https://realfavicongenerator.net/
2. **PWA 图标生成器**: https://www.pwabuilder.com/imageGenerator
3. **图标设计工具**: Figma, Adobe Illustrator, Canva

### 设计要求
1. **主题色**: #1890ff (Ant Design 主色)
2. **背景**: 透明或白色
3. **风格**: 简洁、现代、易识别
4. **格式**: PNG 带透明度

### 检查清单
- [ ] 所有图标尺寸正确
- [ ] 图标清晰无锯齿
- [ ] 颜色符合品牌规范
- [ ] 文件命名正确
- [ ] 文件路径正确

## 临时占位方案

在获得正式图标前，可以使用以下方法创建临时图标：

```bash
# 创建简单占位图标（使用 ImageMagick）
convert -size 192x192 xc:#1890ff -fill white -pointsize 48 -gravity center -draw "text 0,0 'FB'" public/pwa-192x192.png
convert -size 512x512 xc:#1890ff -fill white -pointsize 128 -gravity center -draw "text 0,0 'FB'" public/pwa-512x512.png

# 复制相同图标到其他位置
cp public/pwa-192x192.png public/pwa-maskable-192x192.png
cp public/pwa-512x512.png public/pwa-maskable-512x512.png
cp public/pwa-192x192.png public/apple-touch-icon.png
```

## 图标优化建议

1. **压缩优化**: 使用 TinyPNG 或 ImageOptim 压缩图片
2. **格式选择**: 优先使用 WebP 格式，PNG 作为备选
3. **懒加载**: 非关键图标使用懒加载
4. **CDN 加速**: 使用 CDN 分发图标资源

## 浏览器支持

### iOS Safari
- 需要 apple-touch-icon.png
- 需要 maskable 图标
- 支持添加到主屏幕

### Android Chrome
- 支持 maskable 图标
- 支持安装提示
- 支持推送通知

### 桌面浏览器
- 支持安装为桌面应用
- 支持推送通知
- 支持离线功能