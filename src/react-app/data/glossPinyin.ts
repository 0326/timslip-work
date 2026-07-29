/**
 * 按字标音工具：将词条 + 整体拼音 → 逐字 ruby 标注
 * 只为生僻字（非 GB2312 一级字）显示拼音，常见字不标音
 */

import { isRareChar } from "./commonChars";

/** 单字 + 拼音配对 */
export interface CharPinyin {
  /** 汉字（或标点） */
  char: string;
  /** 对应拼音音节（仅生僻字才有） */
  pinyin?: string;
  /** 是否为生僻字 */
  isRare: boolean;
}

/**
 * 将拼音字符串拆分为音节列表
 * 处理带标点的情况，如 "kuí kuí wéi jǐn, rú zi dào"
 * → ["kuí", "kuí", "wéi", "jǐn", "rú", "zi", "dào"]
 */
function splitPinyinSyllables(pinyinStr: string): string[] {
  return pinyinStr
    .split(/[\s,，、；;:：]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && /[a-z]/i.test(s));
}

/**
 * 解析词条和拼音，返回逐字配对数组
 *
 * @param term 词条文字（如 "蘷蘷唯谨，如子道"）
 * @param pinyin 整体拼音（如 "kuí kuí wéi jǐn, rú zi dào"）
 * @returns 逐字配对数组，仅生僻字有 pinyin
 */
export function parseTermPinyin(
  term: string,
  pinyin?: string,
): CharPinyin[] {
  // 无拼音时，逐字检查是否生僻
  if (!pinyin || !pinyin.trim()) {
    return Array.from(term).map((char) => ({
      char,
      isRare: isRareChar(char),
    }));
  }

  const syllables = splitPinyinSyllables(pinyin);
  const chars = Array.from(term);
  const result: CharPinyin[] = [];
  let syllableIdx = 0;

  for (const char of chars) {
    const isCJK = /[\u4e00-\u9fff]/.test(char);
    const rare = isRareChar(char);

    if (isCJK && syllableIdx < syllables.length) {
      result.push({
        char,
        pinyin: rare ? syllables[syllableIdx] : undefined,
        isRare: rare,
      });
      syllableIdx++;
    } else {
      // 标点或非汉字
      result.push({
        char,
        isRare: false,
      });
    }
  }

  return result;
}

/**
 * 判断词条中是否有任何生僻字
 * 用于决定是否需要显示 ruby 标注
 */
export function hasRareChar(term: string): boolean {
  return Array.from(term).some((c) => isRareChar(c));
}
