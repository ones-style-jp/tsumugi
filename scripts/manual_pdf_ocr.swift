// 2026-10-29 PDF の各ページの文字(PDF の文字＋画像の読み取り)を出す。公開中の PDF に実在のものが写っていないかの確認に使う
//   swift scripts/manual_pdf_ocr.swift public/manual/*.pdf > pdf.tsv
import Foundation
import Vision
import PDFKit
import AppKit
// 使い方: swift ocrpdf.swift <PDF>... → 「ファイル名\tページ\t文字(PDFの文字+画像の読み取り)」
for path in CommandLine.arguments.dropFirst() {
  guard let doc = PDFDocument(url: URL(fileURLWithPath: path)) else { continue }
  for i in 0..<doc.pageCount { guard let pg = doc.page(at: i) else { continue }
    let b = pg.bounds(for: .mediaBox); let sc = 2.0
    let img = pg.thumbnail(of: NSSize(width: b.width * sc, height: b.height * sc), for: .mediaBox)
    var txt = pg.string ?? ""
    if let cg = img.cgImage(forProposedRect: nil, context: nil, hints: nil) {
      let req = VNRecognizeTextRequest(); req.recognitionLanguages = ["ja-JP", "en-US"]; req.recognitionLevel = .accurate
      try? VNImageRequestHandler(cgImage: cg, options: [:]).perform([req])
      txt += " " + (req.results ?? []).compactMap { $0.topCandidates(1).first?.string }.joined(separator: " ") }
    print("\((path as NSString).lastPathComponent)\t\(i + 1)\t\(txt.replacingOccurrences(of: "\n", with: " "))") } }
