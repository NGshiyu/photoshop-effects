# GlassFrame EXIF｜Photoshop 毛玻璃相框

## 使用

1. 将 `GlassFrame-EXIF.jsx` 和 `GlassFrame-EXIF-assets` 文件夹放在同一目录；不要改动素材文件夹名称。
2. 在 Photoshop 中选「文件 → 脚本 → 浏览…」，打开 `GlassFrame-EXIF.jsx`。
3. 选择保有 EXIF 信息的原始 JPG、TIFF 等照片。脚本会在原图旁边生成新的、分层可编辑的 PSD；原图本身不会被保存或覆盖。
4. 如果来源图片没有相机 EXIF，或参数显示不完整，打开 PSD 中的「型号｜可编辑」和「EXIF 参数｜可编辑」文字层手工修改。

## 版式和识别

- 横图、竖图均按照片短边计算边距和字号。前景照片保持原始像素尺寸，背景由同一照片放大并模糊。
- 上沿约为短边的 6%，底部信息区约为短边的 16%；标题字高、参数字高和行距按黄金比例关联，并在可用区域内自动收缩。
- 从 EXIF `Make`、`Model`、焦距、光圈、快门和 ISO 读取信息；也尝试 XMP 备用字段。自动识别 Nikon、Canon、Apple/iPhone、Sony、Fujifilm、Leica、DJI、Panasonic、Olympus、Sigma、Kodak、Insta360、Panavision、Ricoh、GoPro、Zeiss、Polaroid、ARRI、Hasselblad，共 19 个品牌。
- 商标只展示一次，型号中的品牌前缀会去掉；例如 `NIKON Z 6_2` 显示为 Nikon 字标和 `Z6 II`。脚本采样底部虚化背景：浅色选黑色商标，深色选白色商标；相机型号和 EXIF 参数始终为白色。全部 19 个品牌都有黑白两版。
- 自动读取的是文件内已有的 EXIF，不能从图片画面推断真实相机；社交平台转存、截图和某些导出文件可能已清除元数据。焦距可能是镜头实际焦距，不一定是 35 mm 等效焦距。

## 文件

- `GlassFrame-EXIF.jsx`：Photoshop 脚本。
- `GlassFrame-EXIF-assets`：字标 PNG 素材，须与脚本相邻。
- `GlassFrame-EXIF-素材来源.md`：素材来源和使用说明。

已在 Photoshop 2026 中用 3970 × 5967 的竖图和 6048 × 3588 的横图运行，生成并检查了 PSD。Apple 图标使用模拟的 iPhone EXIF 做过界面测试；所附 Nikon 样张仍保留其真实 Nikon 参数。
