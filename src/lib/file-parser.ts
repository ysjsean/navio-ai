export async function parseFile(file: File): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = file.name.split(".").pop()?.toLowerCase();

  if (ext === "pdf") {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ verbosity: 0 });
    // @ts-expect-error - load is considered private in the type definitions but is needed
    await parser.load(buffer);
    const textResult = await parser.getText();
    parser.destroy();
    return textResult.text || textResult.pages?.map((p) => p.text).join("\n") || "";
  }

  if (ext === "docx") {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  throw new Error(`Unsupported file type: .${ext}. Only .pdf and .docx are supported.`);
}
