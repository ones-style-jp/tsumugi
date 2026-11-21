// 2026-10-29 マニュアルの画像の文字を読み取る(macOS の Vision)。実在の店舗名・番号・職員の名前が写っていないかの確認に使う
//   swift scripts/manual_img_ocr.swift public/manual/img > ocr.tsv  →  ocr.tsv を /ひかり|扇橋|6458|佐藤\s?健一|高橋|岩岡|長谷川|田中/ で探す
import Foundation
import Vision
import AppKit
let dir = CommandLine.arguments[1]
let fm = FileManager.default
let files = (try? fm.contentsOfDirectory(atPath: dir))?.filter { $0.hasSuffix(".jpg") || $0.hasSuffix(".png") }.sorted() ?? []
for f in files {
  let url = URL(fileURLWithPath: dir).appendingPathComponent(f)
  guard let img = NSImage(contentsOf: url), let cg = img.cgImage(forProposedRect: nil, context: nil, hints: nil) else { continue }
  let req = VNRecognizeTextRequest()
  req.recognitionLanguages = ["ja-JP", "en-US"]
  req.recognitionLevel = .accurate
  let h = VNImageRequestHandler(cgImage: cg, options: [:])
  try? h.perform([req])
  let txt = (req.results ?? []).compactMap { $0.topCandidates(1).first?.string }.joined(separator: " ")
  print("\(f)\t\(txt.replacingOccurrences(of: "\n", with: " "))")
}
