#!/usr/bin/env swift
import AppKit

let args = CommandLine.arguments
let input = args.count > 1 ? args[1] : "icon.png"
let output = args.count > 2 ? args[2] : "app-icon.png"

guard let tile = NSImage(contentsOfFile: input) else { fatalError("cannot read \(input)") }

let S: CGFloat = 1024
guard let rep = NSBitmapImageRep(
    bitmapDataPlanes: nil,
    pixelsWide: Int(S),
    pixelsHigh: Int(S),
    bitsPerSample: 8,
    samplesPerPixel: 4,
    hasAlpha: true,
    isPlanar: false,
    colorSpaceName: .deviceRGB,
    bytesPerRow: 0,
    bitsPerPixel: 0
) else { fatalError("bitmap") }
rep.size = NSSize(width: S, height: S)

NSGraphicsContext.saveGraphicsState()
guard let ns = NSGraphicsContext(bitmapImageRep: rep) else { fatalError("ctx") }
NSGraphicsContext.current = ns
ns.shouldAntialias = true
ns.imageInterpolation = .high

let pad = S * 0.10
tile.draw(in: NSRect(x: pad, y: pad, width: S - pad * 2, height: S - pad * 2))

NSColor(calibratedWhite: 1, alpha: 2.0 / 255.0).setFill()
let pin: CGFloat = 2
NSRect(x: 0, y: 0, width: pin, height: pin).fill()
NSRect(x: S - pin, y: 0, width: pin, height: pin).fill()
NSRect(x: 0, y: S - pin, width: pin, height: pin).fill()
NSRect(x: S - pin, y: S - pin, width: pin, height: pin).fill()
NSGraphicsContext.restoreGraphicsState()

guard let png = rep.representation(using: .png, properties: [:]) else { fatalError("png") }
try png.write(to: URL(fileURLWithPath: output))
print("wrote \(output) \(Int(S))x\(Int(S)), pad \(Int(pad / S * 100))%, pin corners")
