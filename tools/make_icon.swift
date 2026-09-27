// Site icons in the hero's palette: dusk sky, the horizon's halation, and a path of light on the sea.
// Run from the site root: swift tools/make_icon.swift
import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

func rgb(_ hex: UInt32, _ a: CGFloat = 1) -> CGColor {
  CGColor(red: CGFloat(hex >> 16 & 255) / 255, green: CGFloat(hex >> 8 & 255) / 255, blue: CGFloat(hex & 255) / 255, alpha: a)
}

func gradient(_ stops: [(CGFloat, CGColor)]) -> CGGradient {
  CGGradient(colorsSpace: CGColorSpace(name: CGColorSpace.sRGB), colors: stops.map { $0.1 } as CFArray, locations: stops.map { $0.0 })!
}

struct Seeded {
  var s: UInt64
  mutating func next() -> CGFloat {
    s ^= s << 13; s ^= s >> 7; s ^= s << 17
    return CGFloat(s % 1_000_000) / 1_000_000
  }
}

func draw(_ c: CGContext, _ n: CGFloat, rounded: Bool) {
  let horizon = n * 0.5
  if rounded {
    c.addPath(CGPath(roundedRect: CGRect(x: 0, y: 0, width: n, height: n), cornerWidth: n * 0.22, cornerHeight: n * 0.22, transform: nil))
    c.clip()
  }
  c.drawLinearGradient(gradient([(0, rgb(0x0b2470)), (0.7, rgb(0x1d4fae)), (1, rgb(0x3169c4))]),
                       start: .zero, end: CGPoint(x: 0, y: horizon), options: [])
  c.saveGState()
  c.clip(to: CGRect(x: 0, y: horizon, width: n, height: n - horizon))
  c.drawLinearGradient(gradient([(0, rgb(0x3f7fe0)), (0.12, rgb(0x2459c8)), (0.45, rgb(0x123fae)), (1, rgb(0x071c66))]),
                       start: CGPoint(x: 0, y: horizon), end: CGPoint(x: 0, y: n), options: [])
  c.restoreGState()

  // far hills, low and hazy
  let hills = CGMutablePath()
  hills.move(to: CGPoint(x: 0, y: horizon))
  for i in 0...40 {
    let x = CGFloat(i) / 40
    let lift = pow(max(0, sin(x * .pi * 1.7 - 0.25)), 2) * 0.055 + max(0, sin(x * .pi * 4.2 + 1.2)) * 0.012
    hills.addLine(to: CGPoint(x: x * n, y: horizon - n * lift))
  }
  hills.addLine(to: CGPoint(x: n, y: horizon))
  c.addPath(hills); c.setFillColor(rgb(0x1a4498, 0.85)); c.fillPath()

  // halation along the horizon
  c.saveGState()
  c.clip(to: CGRect(x: 0, y: horizon - n * 0.06, width: n, height: n * 0.12))
  c.drawLinearGradient(gradient([(0, rgb(0xbee1ff, 0)), (0.5, rgb(0xbee1ff, 0.45)), (1, rgb(0xbee1ff, 0))]),
                       start: CGPoint(x: 0, y: horizon - n * 0.06), end: CGPoint(x: 0, y: horizon + n * 0.06), options: [])
  c.restoreGState()

  // the light's glow on the water, widening toward the viewer
  c.saveGState()
  c.clip(to: CGRect(x: 0, y: horizon, width: n, height: n - horizon))
  c.translateBy(x: n / 2, y: horizon)
  c.scaleBy(x: 0.42, y: 1)
  c.drawRadialGradient(gradient([(0, rgb(0xc8e4ff, 0.42)), (0.5, rgb(0x96c8ff, 0.14)), (1, rgb(0x96c8ff, 0))]),
                       startCenter: .zero, startRadius: 0, endCenter: .zero, endRadius: n * 0.62, options: [])
  c.restoreGState()

  var r = Seeded(s: 0x7a3b_91c4_55e2_0d17)
  if n < 40 {
    // too few pixels for scattered light: a short column of glints on the path
    for (z, w, a) in [(0.1, 4.0, 0.95), (0.3, 3.0, 0.75), (0.55, 5.0, 0.6), (0.82, 3.0, 0.45)] as [(CGFloat, CGFloat, CGFloat)] {
      let y = (horizon + n * 0.06 + z * n * 0.4).rounded()
      c.setFillColor(rgb(0xf4f9ff, a))
      c.fill(CGRect(x: (n / 2 - w * n / 64).rounded(), y: y, width: (w * n / 32).rounded(), height: max(1, n / 32)))
    }
  } else {
    // glints crowd by the horizon and gather along the path, as on the business card
    func gauss() -> CGFloat { sqrt(-2 * log(max(1e-9, r.next()))) * cos(2 * .pi * r.next()) }
    var dots: [CGRect] = []
    for i in 0..<2600 {
      let z = pow(r.next(), 1.7)
      let x = i % 4 == 0 ? r.next() * n : n / 2 + gauss() * n * (0.015 + z * 0.15)
      let y = horizon + n * 0.02 + z * (n * 0.5)
      let h = n * (0.006 + z * 0.014)
      let w = h * (2.4 + r.next() * 2.6)
      let dot = CGRect(x: x - w / 2, y: y - h / 2, width: w, height: h)
      if dots.contains(where: { $0.insetBy(dx: -h * 0.6, dy: -h * 0.5).intersects(dot) }) { continue }
      dots.append(dot)
      let a = 0.95 - z * 0.3 - min(0.6, abs(x - n / 2) / n * 1.4)
      c.setFillColor(rgb(0xf4f9ff, max(0.18, a)))
      c.fillEllipse(in: dot)
    }
  }

  // film grain, only where there are pixels enough to carry it
  if n >= 128 {
    for _ in 0..<Int(n * n * 0.04) {
      let v = r.next()
      c.setFillColor(v > 0.5 ? rgb(0xffffff, 0.035) : rgb(0x000820, 0.06))
      c.fill(CGRect(x: r.next() * n, y: r.next() * n, width: n / 256 + 0.5, height: n / 256 + 0.5))
    }
  }

  // darken the foreground, as the hero does
  c.saveGState()
  c.clip(to: CGRect(x: 0, y: n * 0.7, width: n, height: n * 0.3))
  c.drawLinearGradient(gradient([(0, rgb(0x05103c, 0)), (1, rgb(0x05103c, 0.45))]),
                       start: CGPoint(x: 0, y: n * 0.7), end: CGPoint(x: 0, y: n), options: [])
  c.restoreGState()
}

func write(_ file: String, _ size: Int, rounded: Bool) {
  let n = CGFloat(size)
  let c = CGContext(data: nil, width: size, height: size, bitsPerComponent: 8, bytesPerRow: 0,
                    space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
  c.translateBy(x: 0, y: n); c.scaleBy(x: 1, y: -1)
  c.interpolationQuality = .high
  draw(c, n, rounded: rounded)
  let url = URL(fileURLWithPath: file)
  let dest = CGImageDestinationCreateWithURL(url as CFURL, UTType.png.identifier as CFString, 1, nil)!
  CGImageDestinationAddImage(dest, c.makeImage()!, nil)
  CGImageDestinationFinalize(dest)
}

write("assets/icon-32.png", 32, rounded: true)
write("assets/icon-192.png", 192, rounded: true)
write("assets/icon-512.png", 512, rounded: true)
write("assets/apple-touch-icon.png", 180, rounded: false)
