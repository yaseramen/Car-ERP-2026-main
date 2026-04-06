"use client";

import { forwardRef } from "react";

/**
 * حقل باركود للماسح الضوئي: يمنع Enter من إرسال النموذج (الماسح يرسل Enter بعد القراءة).
 * autoComplete="off" يقلل اعتراض المتصفح للتركيز.
 */
export const BarcodeTextInput = forwardRef<
  HTMLInputElement,
  Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "autoComplete">
>(function BarcodeTextInput({ onKeyDown, className, ...rest }, ref) {
  return (
    <input
      {...rest}
      ref={ref}
      type="text"
      inputMode="text"
      autoComplete="off"
      autoCorrect="off"
      spellCheck={false}
      className={className}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
        }
        onKeyDown?.(e);
      }}
    />
  );
});
