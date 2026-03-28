import mammoth from "mammoth";
import pdf from "pdf-parse";

export async function parseFile(file: File): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase();
  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    if (ext === "pdf") {
      const data = await pdf(buffer);
      const text = (data.text || "").trim();
      if (!text) {
        throw new Error("The PDF file was parsed but no readable text was found.");
      }
      return text;
    }

    if (ext === "docx") {
      const result = await mammoth.extractRawText({ buffer });
      const text = (result.value || "").trim();
      if (!text) {
        throw new Error("The DOCX file was parsed but no readable text was found.");
      }
      return text;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown parser error";
    throw new Error(`Failed to parse ${file.name}: ${message}`);
  }

  throw new Error(`Unsupported file type: .${ext || "unknown"}. Only PDF and DOCX are supported.`);
}
