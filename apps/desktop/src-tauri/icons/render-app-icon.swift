#!/usr/bin/env swift
import AppKit
import Foundation

/// Renders the Harnesys mark:
///   app  — 1024² faceted glass H, transparent background
///   tray — 72² black+alpha template glyph for the menu bar

enum Kind: String { case app, tray }

let kind: Kind = {
    let arg = CommandLine.arguments.dropFirst().first ?? "app"
    return Kind(rawValue: arg) ?? .app
}()

let out: String = {
    if CommandLine.arguments.count > 2 { return CommandLine.arguments[2] }
    return kind == .app ? "app-icon.png" : "tray.png"
}()

let pixel = kind == .app ? 1024 : 72

guard let rep = NSBitmapImageRep(
    bitmapDataPlanes: nil,
    pixelsWide: pixel,
    pixelsHigh: pixel,
    bitsPerSample: 8,
    samplesPerPixel: 4,
    hasAlpha: true,
    isPlanar: false,
    colorSpaceName: .deviceRGB,
    bytesPerRow: 0,
    bitsPerPixel: 0
) else { fatalError("bitmap") }

rep.size = NSSize(width: pixel, height: pixel)
NSGraphicsContext.saveGraphicsState()
guard let ns = NSGraphicsContext(bitmapImageRep: rep) else { fatalError("ctx") }
NSGraphicsContext.current = ns
ns.shouldAntialias = true
ns.imageInterpolation = .high
let ctx = ns.cgContext
let S = CGFloat(pixel)

func hex(_ s: String, a: CGFloat = 1) -> NSColor {
    var n = s.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
    if n.count == 3 { n = n.map { "\($0)\($0)" }.joined() }
    var v: UInt64 = 0
    Scanner(string: n).scanHexInt64(&v)
    return NSColor(
        calibratedRed: CGFloat((v >> 16) & 0xFF) / 255,
        green: CGFloat((v >> 8) & 0xFF) / 255,
        blue: CGFloat(v & 0xFF) / 255,
        alpha: a
    )
}

/// Letter outline in the 1024 SVG space (posts 250, gap 220, crossbar 160).
func letterPath() -> CGPath {
    let p = CGMutablePath()
    p.move(to: CGPoint(x: 152, y: 152))
    p.addLine(to: CGPoint(x: 402, y: 152))
    p.addLine(to: CGPoint(x: 402, y: 432))
    p.addLine(to: CGPoint(x: 622, y: 432))
    p.addLine(to: CGPoint(x: 622, y: 152))
    p.addLine(to: CGPoint(x: 872, y: 152))
    p.addLine(to: CGPoint(x: 872, y: 872))
    p.addLine(to: CGPoint(x: 622, y: 872))
    p.addLine(to: CGPoint(x: 622, y: 592))
    p.addLine(to: CGPoint(x: 402, y: 592))
    p.addLine(to: CGPoint(x: 402, y: 872))
    p.addLine(to: CGPoint(x: 152, y: 872))
    p.closeSubpath()
    return p
}

func poly(_ pts: [(CGFloat, CGFloat)], _ color: NSColor) {
    let p = CGMutablePath()
    for (i, pt) in pts.enumerated() {
        if i == 0 { p.move(to: CGPoint(x: pt.0, y: pt.1)) } else { p.addLine(to: CGPoint(x: pt.0, y: pt.1)) }
    }
    p.closeSubpath()
    ctx.addPath(p)
    ctx.setFillColor(color.cgColor)
    ctx.fillPath()
}

func polyGrad(_ pts: [(CGFloat, CGFloat)], _ grad: CGGradient, _ from: CGPoint, _ to: CGPoint, _ alpha: CGFloat) {
    let p = CGMutablePath()
    for (i, pt) in pts.enumerated() {
        if i == 0 { p.move(to: CGPoint(x: pt.0, y: pt.1)) } else { p.addLine(to: CGPoint(x: pt.0, y: pt.1)) }
    }
    p.closeSubpath()
    ctx.saveGState()
    ctx.addPath(p)
    ctx.clip()
    ctx.setAlpha(alpha)
    ctx.drawLinearGradient(grad, start: from, end: to, options: [.drawsBeforeStartLocation, .drawsAfterEndLocation])
    ctx.restoreGState()
}

if kind == .app {
    // The bitmap context is y-up (bottom-left origin): flip so the SVG
    // letter coordinates (y grows down) land upright.
    ctx.translateBy(x: 0, y: S)
    ctx.scaleBy(x: 1, y: -1)

    let body = CGGradient(
        colorsSpace: CGColorSpaceCreateDeviceRGB(),
        colors: [hex("2e3947").cgColor, hex("161b22").cgColor, hex("080b0f").cgColor] as CFArray,
        locations: [0, 0.45, 1]
    )!
    let spec = CGGradient(
        colorsSpace: CGColorSpaceCreateDeviceRGB(),
        colors: [hex("ccd4dc").cgColor, hex("93a5b4").cgColor] as CFArray,
        locations: [0, 1]
    )!
    let glint = CGGradient(
        colorsSpace: CGColorSpaceCreateDeviceRGB(),
        colors: [hex("c7d3dd").cgColor, hex("5d6b78").cgColor] as CFArray,
        locations: [0, 1]
    )!
    let edge = CGGradient(
        colorsSpace: CGColorSpaceCreateDeviceRGB(),
        colors: [hex("d2d8de", a: 0.3).cgColor, hex("d2d8de", a: 0.02).cgColor] as CFArray,
        locations: [0, 1]
    )!

    // Letter only — no tile, no border: the glyph floats on transparency.

    ctx.saveGState()
    ctx.addPath(letterPath())
    ctx.clip()

    ctx.drawLinearGradient(
        body,
        start: CGPoint(x: 512, y: 152),
        end: CGPoint(x: 512, y: 872),
        options: [.drawsBeforeStartLocation, .drawsAfterEndLocation]
    )

    // Left post: dark slash, top specular, sliver, bottom glint, edge light, streak.
    poly([(402, 152), (402, 712), (152, 772)], hex("0a0d11", a: 0.9))
    polyGrad([(152, 152), (402, 152), (152, 352)], spec, CGPoint(x: 277, y: 152), CGPoint(x: 277, y: 352), 0.9)
    poly([(402, 152), (362, 152), (402, 252)], hex("b8c1ca", a: 0.35))
    polyGrad([(152, 872), (372, 872), (152, 652)], glint, CGPoint(x: 262, y: 652), CGPoint(x: 262, y: 872), 0.55)
    ctx.saveGState()
    ctx.clip(to: CGRect(x: 152, y: 152, width: 10, height: 720))
    ctx.drawLinearGradient(edge, start: CGPoint(x: 157, y: 152), end: CGPoint(x: 157, y: 872), options: [])
    ctx.restoreGState()
    poly([(252, 252), (278, 252), (218, 432), (198, 432)], hex("b7c0c9", a: 0.22))

    // Right post: mirrored.
    poly([(622, 152), (622, 712), (872, 772)], hex("0a0d11", a: 0.9))
    polyGrad([(872, 152), (622, 152), (872, 352)], spec, CGPoint(x: 747, y: 152), CGPoint(x: 747, y: 352), 0.9)
    poly([(622, 152), (662, 152), (622, 252)], hex("b8c1ca", a: 0.35))
    polyGrad([(872, 872), (652, 872), (872, 652)], glint, CGPoint(x: 762, y: 652), CGPoint(x: 762, y: 872), 0.55)
    ctx.saveGState()
    ctx.clip(to: CGRect(x: 862, y: 152, width: 10, height: 720))
    ctx.drawLinearGradient(edge, start: CGPoint(x: 867, y: 152), end: CGPoint(x: 867, y: 872), options: [])
    ctx.restoreGState()
    poly([(792, 552), (812, 552), (762, 712), (742, 712)], hex("b7c0c9", a: 0.15))

    // Crossbar: bright top wedge, shadow underneath, corner glints.
    poly([(402, 432), (622, 432), (402, 532)], hex("b5bec8", a: 0.6))
    poly([(402, 592), (622, 592), (522, 702)], hex("090c10", a: 0.9))
    poly([(402, 332), (402, 432), (492, 432)], hex("aeb8c2", a: 0.4))
    poly([(622, 332), (622, 432), (532, 432)], hex("aeb8c2", a: 0.25))

    ctx.restoreGState()

    // Transparent padding around the bare glyph; pins keep resizers
    // from trimming the canvas and scaling the letter back up.
    // makeImage() snapshots device pixels, so cancel the y-flip before
    // drawing the snapshot again — otherwise it lands mirrored.
    ctx.concatenate(ctx.ctm.inverted())
    guard let baked = ctx.makeImage() else { fatalError("snapshot") }
    ctx.clear(CGRect(x: 0, y: 0, width: S, height: S))
    let pad = S * 0.04
    ctx.interpolationQuality = .high
    ctx.draw(baked, in: CGRect(x: pad, y: pad, width: S - pad * 2, height: S - pad * 2))

    // Keep the full 1024² bounds so resizers / the Dock cannot trim
    // transparent padding and scale the squircle back up.
    ctx.setFillColor(NSColor(calibratedWhite: 1, alpha: 2.0 / 255.0).cgColor)
    let pin: CGFloat = 2
    ctx.fill(CGRect(x: 0, y: 0, width: pin, height: pin))
    ctx.fill(CGRect(x: S - pin, y: 0, width: pin, height: pin))
    ctx.fill(CGRect(x: 0, y: S - pin, width: pin, height: pin))
    ctx.fill(CGRect(x: S - pin, y: S - pin, width: pin, height: pin))
} else {
    // Tray template: black glyph + alpha only. macOS tints it for the
    // active menu bar appearance (light / dark / highlighted).
    // Same y-up context: flip, then fit the 720-unit letter box at
    // (152,152) to 72% of the canvas, centered.
    ctx.translateBy(x: 0, y: S)
    ctx.scaleBy(x: 1, y: -1)
    let scale = 0.72 * S / 720
    let tx = (S - 720 * scale) / 2 - 152 * scale
    ctx.translateBy(x: tx, y: tx)
    ctx.scaleBy(x: scale, y: scale)
    ctx.addPath(letterPath())
    ctx.setFillColor(NSColor.black.cgColor)
    ctx.fillPath()
}

NSGraphicsContext.restoreGraphicsState()

guard let png = rep.representation(using: .png, properties: [:]) else { fatalError("png") }
try png.write(to: URL(fileURLWithPath: out))
print("wrote \(out) \(pixel)x\(pixel)")
