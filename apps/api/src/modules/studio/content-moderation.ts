import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const riskKeywords = [
  ["色情", ["色情", "淫秽", "裸聊", "裸照", "性爱", "性交易", "成人影片"]],
  ["暴力", ["暴力", "血腥", "虐待", "杀人", "自杀", "爆炸", "砍杀", "枪击", "恐怖袭击"]],
] as const;

export function findOcrRiskKeywords(text: string) {
  const normalized = text.toLowerCase().replace(/\s+/g, "");
  return riskKeywords.flatMap(([category, words]) => words.filter((word) => normalized.includes(word.toLowerCase())).map((word) => ({ category, keyword: word }))).slice(0, 8);
}

export async function extractImageText(filePath: string) {
  const { stdout } = await execFileAsync("tesseract", [filePath, "stdout", "-l", "chi_sim+eng"], {
    timeout: 12_000,
    maxBuffer: 1024 * 1024,
    windowsHide: true,
  });
  return stdout.trim().slice(0, 20_000);
}
