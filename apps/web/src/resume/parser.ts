import * as pdfjsLib from 'pdfjs-dist';
import mammoth from 'mammoth';

// Configure pdfjs worker
if (typeof window !== 'undefined' && pdfjsLib.GlobalWorkerOptions) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url
  ).toString();
}

export interface ParseResult {
  success: boolean;
  text: string;
  error?: string;
  isScannedOrEmpty?: boolean;
}

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const MAX_PAGES = 4;
const MIN_TEXT_LENGTH = 200;

export async function parseResumeFile(file: File): Promise<ParseResult> {
  if (file.size > MAX_FILE_SIZE) {
    return {
      success: false,
      text: '',
      error: 'File size exceeds 5 MB limit.',
    };
  }

  const name = file.name.toLowerCase();

  try {
    let extractedText = '';

    if (name.endsWith('.pdf')) {
      const arrayBuffer = await file.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
      const pdf = await loadingTask.promise;
      const numPages = Math.min(pdf.numPages, MAX_PAGES);

      const pageTexts: string[] = [];
      for (let i = 1; i <= numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageString = textContent.items
          .map((item: any) => item.str || '')
          .join(' ');
        pageTexts.push(pageString);
      }
      extractedText = pageTexts.join('\n');
    } else if (name.endsWith('.docx')) {
      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.extractRawText({ arrayBuffer });
      extractedText = result.value || '';
    } else if (name.endsWith('.txt')) {
      extractedText = await file.text();
    } else {
      // Attempt plain text read as fallback
      extractedText = await file.text();
    }

    const trimmed = extractedText.trim();
    if (trimmed.length < MIN_TEXT_LENGTH) {
      return {
        success: false,
        text: trimmed,
        isScannedOrEmpty: true,
        error: 'Resume text is under 200 characters or may be a scanned image.',
      };
    }

    return {
      success: true,
      text: trimmed,
    };
  } catch (err: any) {
    return {
      success: false,
      text: '',
      error: `Failed to parse file: ${err?.message || 'unknown error'}`,
    };
  }
}
