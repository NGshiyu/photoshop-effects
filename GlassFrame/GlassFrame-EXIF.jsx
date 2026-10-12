#target photoshop
/*
 * GlassFrame-EXIF.jsx
 * Photoshop: File > Scripts > Browse, then choose one original photo.
 * Creates a layered glass-frame PSD next to the input image.
 */
(function () {
    var oldUnits = app.preferences.rulerUnits;
    var oldDialogs = app.displayDialogs;
    app.preferences.rulerUnits = Units.PIXELS;
    app.displayDialogs = DialogModes.NO;
    try {
        var input = File.openDialog("选择保留 EXIF 的原始照片");
        if (!input) return;
        var source = app.open(input);
        var exif = readExif(source);
        var doc = source.duplicate(input.name.replace(/\.[^.]+$/, "") + "-glass-frame", false);
        source.close(SaveOptions.DONOTSAVECHANGES);
        app.activeDocument = doc;
        if (doc.mode !== DocumentMode.RGB) doc.changeMode(ChangeMode.RGB);
        var w = doc.width.as("px"), h = doc.height.as("px");
        if (w < 400 || h < 250) throw new Error("照片像素过小，请使用原图。");
        var original = doc.activeLayer;
        original.name = "原图备份（隐藏）";
        var photo = original.duplicate();
        photo.name = "清晰照片｜圆角图层";
        var blur = original.duplicate();
        blur.name = "同图虚化背景";
        blur.move(photo, ElementPlacement.PLACEAFTER);
        original.visible = false;

        var shortSide = Math.min(w, h);
        var cw = Math.round(w * 1.20), ch = Math.round(h + shortSide * 0.22);
        doc.resizeCanvas(UnitValue(cw, "px"), UnitValue(ch, "px"), AnchorPosition.MIDDLECENTER);
        // The foreground is kept at its original pixel dimensions.
        // Upper rim = 0.06 of the short side; lower caption = 0.16.
        photo.translate(0, UnitValue(-0.05 * shortSide, "px"));
        blur.resize(130, 130, AnchorPosition.MIDDLECENTER);
        doc.activeLayer = blur;
        blur.applyGaussianBlur(Math.max(12, Math.round(w * 0.027)));

        doc.activeLayer = photo;
        var b = photo.bounds;
        var left = b[0].as("px"), top = b[1].as("px");
        var right = b[2].as("px"), bottom = b[3].as("px");
        // Sample the RGB composite before creating the rounded layer mask.
        // Photoshop activates the mask channel after revealSelectionMask(),
        // which would otherwise make every footer sample appear black.
        var footerH = ch - bottom;
        var brand = brandProfile(exif);
        var tone = captionLuminance(doc, cw, bottom, footerH) >= 0.179 ? "black" : "white";
        // Only the brand mark follows the blurred footer's brightness.
        // Model and EXIF text stay white in both layouts.
        brand.wordColor = tone === "black" ? "000000" : "FFFFFF";
        brand.modelColor = "FFFFFF";
        brand.paramsColor = "FFFFFF";
        if (brand.asset) {
            var assetStem = brand.asset.replace(/-(black|white)\.png$/i, "").replace(/\.png$/i, "");
            brand.asset = assetStem + "-" + tone + ".png";
        }
        roundedSelection(left, top, right, bottom, Math.round(Math.min(w, h) * 0.055));
        try {
            revealSelectionMask();
        } catch (maskError) {
            // Older Photoshop builds sometimes reject the mask command.
            // Use a rounded copy and preserve the untouched layer hidden below it.
            doc.activeLayer = photo;
            doc.selection.copy();
            var rounded = doc.paste();
            photo.visible = false;
            rounded.name = "清晰照片｜圆角副本";
            photo = rounded;
        }
        doc.selection.deselect();
        addShadow(Math.round(w * 0.014), Math.round(w * 0.022));

        var model = cleanModel(exif.model, brand) || "相机型号（请填写）";
        var params = formatParams(exif) || "焦距  ·  光圈  ·  快门  ·  ISO（请填写）";
        var phi = (1 + Math.sqrt(5)) / 2;
        var titleH = Math.min(shortSide * 0.05, footerH * 0.30);
        var paramsH = titleH / phi;
        var lineGap = titleH / (phi * phi);
        var blockH = titleH + lineGap + paramsH;
        var blockTop = bottom + (footerH - blockH) / 2;
        addBrandRow(doc, brand, model, cw, blockTop + titleH / 2, titleH);
        var paramsLayer = addText(doc, "EXIF 参数｜可编辑", params,
                Math.round(cw / 2), 0, Math.max(11, Math.round(paramsH)),
                brand.paramsColor, brand.paramsFont, Justification.CENTER);
        fitTextHeight(paramsLayer, paramsH, cw * 0.86);
        moveToTop(paramsLayer, blockTop + titleH + lineGap);
        doc.activeLayer = photo;

        var stem = input.name.replace(/\.[^.]+$/, "");
        var out = uniqueFile(input.parent, stem + "-glass-frame", ".psd");
        var opts = new PhotoshopSaveOptions();
        opts.layers = true;
        opts.embedColorProfile = true;
        doc.saveAs(out, opts, false, Extension.LOWERCASE);
        alert("已生成可编辑 PSD：\n" + out.fsName +
              (exif.found ? "\n已读取原图 EXIF；请核对焦距单位。" : "\n原图没有可用 EXIF，请编辑底部两个文字层。"));
    } catch (e) {
        alert("制作失败：" + e.message + (e.line ? "（脚本第 " + e.line + " 行）" : ""));
    } finally {
        app.preferences.rulerUnits = oldUnits;
        app.displayDialogs = oldDialogs;
    }

    function readExif(doc) {
        var result = { found: false, make: "", model: "", focal: "", aperture: "", shutter: "", iso: "" };
        var tags = [];
        try { tags = doc.info.exif || []; } catch (_) {}
        for (var i = 0; i < tags.length; i++) {
            var key = String(tags[i][0]).toLowerCase();
            var value = String(tags[i][1]);
            if (!result.make && /(^|\s)make/.test(key)) result.make = value;
            if (!result.model && /camera model|model/.test(key)) result.model = value;
            if (!result.focal && /focal length/.test(key)) result.focal = value;
            if (!result.aperture && /f.number|fnumber|aperture/.test(key)) result.aperture = value;
            if (!result.shutter && /exposure time|shutter speed/.test(key)) result.shutter = value;
            if (!result.iso && /iso speed|iso setting|photographic sensitivity/.test(key)) result.iso = value;
        }
        try {
            if (ExternalObject.AdobeXMPScript === undefined)
                ExternalObject.AdobeXMPScript = new ExternalObject("lib:AdobeXMPScript");
            var xmp = new XMPMeta(doc.xmpMetadata.rawData);
            var tiff = XMPConst.NS_TIFF, exif = XMPConst.NS_EXIF;
            result.make = result.make || prop(xmp, tiff, "Make");
            result.model = result.model || prop(xmp, tiff, "Model");
            result.focal = result.focal || prop(xmp, exif, "FocalLength");
            result.aperture = result.aperture || prop(xmp, exif, "FNumber");
            result.shutter = result.shutter || prop(xmp, exif, "ExposureTime");
            result.iso = result.iso || prop(xmp, exif, "ISOSpeedRatings[1]") || prop(xmp, exif, "PhotographicSensitivity");
        } catch (_) {}
        result.found = !!(result.make || result.model || result.focal || result.aperture || result.shutter || result.iso);
        return result;
    }
    function prop(xmp, ns, name) {
        try { var p = xmp.getProperty(ns, name); return p ? String(p.value) : ""; } catch (_) { return ""; }
    }
    function captionLuminance(doc, width, bottom, footerH) {
        var xs = [0.30, 0.40, 0.50, 0.60, 0.70];
        var ys = [0.46, 0.66], values = [];
        for (var i = 0; i < xs.length; i++) {
            for (var j = 0; j < ys.length; j++) {
                var sampler = null;
                try {
                    sampler = doc.colorSamplers.add([
                        UnitValue(width * xs[i], "px"),
                        UnitValue(bottom + footerH * ys[j], "px")
                    ]);
                    var rgb = sampler.color.rgb;
                    values.push(0.2126 * linearChannel(rgb.red) +
                                0.7152 * linearChannel(rgb.green) +
                                0.0722 * linearChannel(rgb.blue));
                } catch (_) {}
                finally { try { if (sampler) sampler.remove(); } catch (_) {} }
            }
        }
        if (!values.length) return 0;
        values.sort(function (a, b) { return a - b; });
        var middle = Math.floor(values.length / 2);
        return values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2;
    }
    function linearChannel(value) {
        var channel = value / 255;
        return channel <= 0.04045 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
    }
    function rational(v) {
        var m = String(v).match(/^\s*(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/);
        return m ? Number(m[1]) / Number(m[2]) : parseFloat(v);
    }
    function formatParams(x) {
        var p = [];
        if (x.focal) {
            var f = rational(x.focal);
            p.push(isNaN(f) ? x.focal : Math.round(f) + "mm");
        }
        if (x.aperture) {
            var a = rational(x.aperture);
            p.push(isNaN(a) ? x.aperture : "f/" + (Math.round(a * 10) / 10));
        }
        if (x.shutter) {
            var s = rational(x.shutter);
            p.push(isNaN(s) ? x.shutter : (s < 1 ? "1/" + Math.round(1 / s) + "s" : (Math.round(s * 10) / 10) + "s"));
        }
        if (x.iso) p.push("ISO " + x.iso.replace(/[^0-9]/g, ""));
        return p.join("  ·  ");
    }
    function brandProfile(exif) {
        var identity = (exif.make + " " + exif.model).toLowerCase();
        var p = { name: "", asset: "", wordFont: "HelveticaNeue-Bold", wordColor: "FFFFFF",
                  modelFont: "HelveticaNeue", modelColor: "FFFFFF",
                  paramsFont: "HelveticaNeue", paramsColor: "F4F4F4" };
        if (/nikon/.test(identity)) {
            p.name = "Nikon"; p.asset = "nikon-wordmark.png";
            p.wordFont = "Arial-BoldItalicMT"; p.wordColor = "150301";
            p.modelFont = "AvenirNext-Medium";
        } else if (/canon/.test(identity)) {
            p.name = "Canon"; p.asset = "canon-official.png";
            p.wordFont = "Georgia-Bold"; p.wordColor = "CC0000";
            p.modelFont = "AvenirNext-Medium";
        } else if (/apple|iphone|ipad/.test(identity)) {
            p.name = "Apple"; p.asset = "apple-symbol-white.png";
            p.wordFont = "SFProDisplay-Regular";
            p.modelFont = "SFProDisplay-Regular"; p.paramsFont = "SFProText-Regular";
        } else if (/sony/.test(identity)) {
            p.name = "SONY"; p.asset = "brand-sony.png"; p.wordFont = "TimesNewRomanPS-BoldMT";
            p.modelFont = "HelveticaNeue-Light";
        } else if (/fuji/.test(identity)) {
            p.name = "FUJIFILM"; p.asset = "brand-fujifilm.png"; p.wordFont = "HelveticaNeue-Bold";
            p.modelFont = "AvenirNext-Regular";
        } else if (/leica/.test(identity)) {
            p.name = "Leica"; p.asset = "brand-leica.png"; p.wordFont = "Georgia-BoldItalic";
            p.modelFont = "HelveticaNeue-Light";
        } else if (/dji/.test(identity)) {
            p.name = "DJI"; p.asset = "brand-dji.png"; p.wordFont = "Arial-BoldItalicMT";
            p.modelFont = "AvenirNext-Medium";
        } else if (/panasonic/.test(identity)) {
            p.name = "Panasonic"; p.asset = "brand-panasonic.png"; p.wordFont = "HelveticaNeue-Bold";
            p.modelFont = "AvenirNext-Regular";
        } else if (/olympus/.test(identity)) {
            p.name = "OLYMPUS"; p.asset = "brand-olympus.png"; p.wordFont = "HelveticaNeue-Bold";
            p.modelFont = "AvenirNext-Regular";
        } else if (/sigma/.test(identity)) {
            p.name = "SIGMA"; p.asset = "brand-sigma.png"; p.modelFont = "AvenirNext-Medium";
        } else if (/kodak/.test(identity)) {
            p.name = "Kodak"; p.asset = "brand-kodak.png"; p.modelFont = "AvenirNext-Medium";
        } else if (/insta360/.test(identity)) {
            p.name = "Insta360"; p.asset = "brand-insta360.png"; p.modelFont = "AvenirNext-Medium";
        } else if (/panavision/.test(identity)) {
            p.name = "Panavision"; p.asset = "brand-panavision.png"; p.modelFont = "AvenirNext-Medium";
        } else if (/ricoh/.test(identity)) {
            p.name = "RICOH"; p.asset = "brand-ricoh.png"; p.modelFont = "AvenirNext-Medium";
        } else if (/gopro/.test(identity)) {
            p.name = "GoPro"; p.asset = "brand-gopro.png"; p.modelFont = "AvenirNext-Medium";
        } else if (/zeiss/.test(identity)) {
            p.name = "ZEISS"; p.asset = "brand-zeiss.png"; p.modelFont = "AvenirNext-Medium";
        } else if (/polaroid/.test(identity)) {
            p.name = "Polaroid"; p.asset = "brand-polaroid.png"; p.modelFont = "AvenirNext-Medium";
        } else if (/arri/.test(identity)) {
            p.name = "ARRI"; p.asset = "brand-arri.png"; p.modelFont = "AvenirNext-Medium";
        } else if (/hasselblad/.test(identity)) {
            p.name = "HASSELBLAD"; p.asset = "brand-hasselblad.png"; p.modelFont = "AvenirNext-Medium";
        }
        return p;
    }
    function cleanModel(raw, brand) {
        var value = String(raw || "").replace(/^\s+|\s+$/g, "");
        if (!value || !brand.name) return value;
        var prefix = {
            Nikon: /^nikon[\s_-]*/i, Canon: /^canon[\s_-]*/i,
            Apple: /^apple[\s_-]*/i, SONY: /^sony[\s_-]*/i,
            FUJIFILM: /^(fujifilm|fuji film)[\s_-]*/i,
            Leica: /^leica[\s_-]*/i, DJI: /^dji[\s_-]*/i,
            Panasonic: /^(panasonic|lumix)[\s_-]*/i,
            OLYMPUS: /^olympus[\s_-]*/i,
            SIGMA: /^sigma[\s_-]*/i, Kodak: /^kodak[\s_-]*/i,
            Insta360: /^insta360[\s_-]*/i, Panavision: /^panavision[\s_-]*/i,
            RICOH: /^ricoh[\s_-]*/i, GoPro: /^gopro[\s_-]*/i,
            ZEISS: /^(zeiss|carl zeiss)[\s_-]*/i, Polaroid: /^polaroid[\s_-]*/i,
            ARRI: /^arri[\s_-]*/i, HASSELBLAD: /^hasselblad[\s_-]*/i
        };
        value = value.replace(prefix[brand.name], "");
        if (brand.name === "Nikon") {
            value = value.replace(/^Z\s+(\d+)_2$/i, "Z$1 II");
            value = value.replace(/^Z\s+(\d+)$/i, "Z$1");
        }
        return value || raw;
    }
    function addBrandRow(doc, brand, model, canvasWidth, centerY, titleH) {
        var modelLayer = addText(doc, "型号｜可编辑", model, 0, 0,
            Math.max(16, Math.round(titleH)), brand.modelColor,
            brand.modelFont, Justification.LEFT);
        fitTextHeight(modelLayer, titleH, canvasWidth * 0.80);
        var modelBounds = modelLayer.bounds;
        var modelW = modelBounds[2].as("px") - modelBounds[0].as("px");
        var modelH = modelBounds[3].as("px") - modelBounds[1].as("px");
        if (!brand.name) {
            moveToLeft(modelLayer, (canvasWidth - modelW) / 2);
            centerAtY(modelLayer, centerY);
            return;
        }
        var logo = null;
        var asset = File(File($.fileName).parent.fsName + "/GlassFrame-EXIF-assets/" + brand.asset);
        if (brand.asset && asset.exists) {
            try { logo = addLogoAsset(doc, asset, Math.max(18, Math.round(titleH))); }
            catch (_) { logo = null; }
        }
        if (!logo) {
            logo = addText(doc, "品牌字标｜可编辑", brand.name, 0, 0,
                Math.max(17, Math.round(titleH)), brand.wordColor,
                brand.wordFont, Justification.LEFT);
            fitTextHeight(logo, titleH, canvasWidth * 0.35);
        }
        var lb = logo.bounds;
        var logoW = lb[2].as("px") - lb[0].as("px");
        var logoH = lb[3].as("px") - lb[1].as("px");
        var gap = Math.round(titleH / ((1 + Math.sqrt(5)) / 2));
        var rowW = logoW + gap + modelW;
        var maxW = canvasWidth * 0.82;
        if (rowW > maxW) {
            var scale = 100 * maxW / rowW;
            logo.resize(scale, scale, AnchorPosition.MIDDLECENTER);
            modelLayer.resize(scale, scale, AnchorPosition.MIDDLECENTER);
            lb = logo.bounds;
            logoW = lb[2].as("px") - lb[0].as("px");
            logoH = lb[3].as("px") - lb[1].as("px");
            modelBounds = modelLayer.bounds;
            modelW = modelBounds[2].as("px") - modelBounds[0].as("px");
            modelH = modelBounds[3].as("px") - modelBounds[1].as("px");
            gap = Math.round(gap * scale / 100);
            rowW = logoW + gap + modelW;
        }
        var rowLeft = (canvasWidth - rowW) / 2;
        moveToLeft(logo, rowLeft);
        moveToLeft(modelLayer, rowLeft + logoW + gap);
        centerAtY(logo, centerY);
        centerAtY(modelLayer, centerY);
    }
    function addLogoAsset(target, file, height) {
        var logoDoc = app.open(file);
        var layer = logoDoc.activeLayer.duplicate(target, ElementPlacement.PLACEATBEGINNING);
        logoDoc.close(SaveOptions.DONOTSAVECHANGES);
        app.activeDocument = target;
        layer.name = "品牌商标｜" + file.name;
        var b = layer.bounds;
        var h = b[3].as("px") - b[1].as("px");
        if (h > 0) layer.resize(height / h * 100, height / h * 100, AnchorPosition.MIDDLECENTER);
        return layer;
    }
    function moveToLeft(layer, x) {
        layer.translate(UnitValue(x - layer.bounds[0].as("px"), "px"), 0);
    }
    function moveToTop(layer, y) {
        layer.translate(0, UnitValue(y - layer.bounds[1].as("px"), "px"));
    }
    function centerAtY(layer, y) {
        var b = layer.bounds;
        layer.translate(0, UnitValue(y - (b[1].as("px") + b[3].as("px")) / 2, "px"));
    }
    function fitTextHeight(layer, height, maxWidth) {
        for (var i = 0; i < 2; i++) {
            var b = layer.bounds, current = b[3].as("px") - b[1].as("px");
            if (current > 0) layer.textItem.size = UnitValue(layer.textItem.size.as("pt") * height / current, "pt");
        }
        var bounds = layer.bounds, width = bounds[2].as("px") - bounds[0].as("px");
        if (width > maxWidth) layer.textItem.size = UnitValue(layer.textItem.size.as("pt") * maxWidth / width, "pt");
    }
    function roundedSelection(l, t, r, b, radius) {
        app.activeDocument.selection.select([[l, t], [r, t], [r, b], [l, b]], SelectionType.REPLACE, 0, false);
        // Photoshop's Smooth selection command rounds the four corners.
        // ExtendScript caps its radius at 100 px in some releases.
        app.activeDocument.selection.smooth(Math.min(100, radius));
    }
    function revealSelectionMask() {
        var d = new ActionDescriptor();
        d.putClass(charIDToTypeID("Nw  "), charIDToTypeID("Chnl"));
        var at = new ActionReference();
        at.putEnumerated(charIDToTypeID("Chnl"), charIDToTypeID("Chnl"), charIDToTypeID("Msk "));
        d.putReference(charIDToTypeID("At  "), at);
        d.putEnumerated(charIDToTypeID("Usng"), charIDToTypeID("UsrM"), charIDToTypeID("RvlS"));
        executeAction(charIDToTypeID("Mk  "), d, DialogModes.NO);
    }
    function addShadow(distance, size) {
        var s = stringIDToTypeID, d = new ActionDescriptor(), ref = new ActionReference();
        ref.putProperty(s("property"), s("layerEffects"));
        ref.putEnumerated(s("layer"), s("ordinal"), s("targetEnum"));
        d.putReference(s("null"), ref);
        var fx = new ActionDescriptor(), sh = new ActionDescriptor(), color = new ActionDescriptor();
        fx.putUnitDouble(s("scale"), s("percentUnit"), 100);
        sh.putBoolean(s("enabled"), true);
        sh.putBoolean(s("present"), true);
        sh.putEnumerated(s("mode"), s("blendMode"), s("multiply"));
        color.putDouble(s("luminance"), 0);
        color.putDouble(s("a"), 0);
        color.putDouble(s("b"), 0);
        sh.putObject(s("color"), s("labColor"), color);
        sh.putUnitDouble(s("opacity"), s("percentUnit"), 52);
        sh.putBoolean(s("useGlobalAngle"), false);
        sh.putUnitDouble(s("localLightingAngle"), s("angleUnit"), 90);
        sh.putUnitDouble(s("distance"), s("pixelsUnit"), distance);
        sh.putUnitDouble(s("chokeMatte"), s("pixelsUnit"), 0);
        sh.putUnitDouble(s("blur"), s("pixelsUnit"), size);
        sh.putUnitDouble(s("noise"), s("percentUnit"), 0);
        sh.putBoolean(s("antiAlias"), false);
        sh.putBoolean(s("layerConceals"), true);
        fx.putObject(s("dropShadow"), s("dropShadow"), sh);
        d.putObject(s("to"), s("layerEffects"), fx);
        executeAction(s("set"), d, DialogModes.NO);
    }
    function addText(doc, name, value, x, y, size, hex, font, justification) {
        var layer = doc.artLayers.add();
        layer.kind = LayerKind.TEXT;
        layer.name = name;
        var item = layer.textItem;
        item.contents = value;
        item.kind = TextType.POINTTEXT;
        // Text size is point-based; convert desired image pixels using document PPI.
        item.size = UnitValue(size * 72 / doc.resolution, "pt");
        item.position = [UnitValue(x, "px"), UnitValue(y, "px")];
        item.justification = justification || Justification.CENTER;
        var c = new SolidColor(); c.rgb.hexValue = hex; item.color = c;
        try { item.font = font || "HelveticaNeue"; } catch (_) { item.font = "HelveticaNeue"; }
        return layer;
    }
    function uniqueFile(folder, stem, ext) {
        var file = File(folder.fsName + "/" + stem + ext), n = 2;
        while (file.exists) file = File(folder.fsName + "/" + stem + "-" + (n++) + ext);
        return file;
    }
}());
