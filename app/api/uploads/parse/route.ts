import { NextResponse } from "next/server";

export const runtime = "nodejs";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_TEXT_CHARS = 30_000;

type ParsedPage = {
  page: number;
  text: string;
};

type PdfTextItem = {
  str?: string;
  hasEOL?: boolean;
};

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function truncateText(text: string) {
  if (text.length <= MAX_TEXT_CHARS) {
    return { text, truncated: false };
  }

  return { text: text.slice(0, MAX_TEXT_CHARS), truncated: true };
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const upload = formData.get("file");

  if (!(upload instanceof File)) {
    return jsonError('Expected a PDF upload in form field "file".', 400);
  }

  if (upload.type !== "application/pdf") {
    return jsonError("Only application/pdf uploads are supported.", 415);
  }

  if (upload.size > MAX_FILE_BYTES) {
    return jsonError("PDF uploads must be 10MB or smaller.", 413);
  }

  const arrayBuffer = await upload.arrayBuffer();
  const pdfjs = await import(/* webpackIgnore: true */ "pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(arrayBuffer),
    disableFontFace: true,
    isEvalSupported: false,
    useWorkerFetch: false
  });

  try {
    const document = await loadingTask.promise;
    const perPage: ParsedPage[] = [];

    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = content.items
        .map((item) => {
          const textItem = item as PdfTextItem;
          return `${textItem.str ?? ""}${textItem.hasEOL ? "\n" : " "}`;
        })
        .join("")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/[ \t]{2,}/g, " ")
        .trim();

      perPage.push({ page: pageNumber, text });
      page.cleanup();
    }

    const fullText = perPage.map((page) => page.text).join("\n\n").trim();
    const pageCount = document.numPages;
    const truncated = truncateText(fullText);

    if (fullText.length === 0) {
      return NextResponse.json({
        filename: upload.name,
        pageCount,
        charCount: 0,
        text: "",
        truncated: false,
        perPage,
        note: "no extractable text"
      });
    }

    return NextResponse.json({
      filename: upload.name,
      pageCount,
      charCount: fullText.length,
      text: truncated.text,
      truncated: truncated.truncated,
      perPage
    });
  } finally {
    await loadingTask.destroy();
  }
}
