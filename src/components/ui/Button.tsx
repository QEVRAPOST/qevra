import type { ButtonHTMLAttributes } from "react";

interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className"> {
  variant?: "primary" | "ghost";
  size?: "default" | "small";
  className?: string;
}

/** Primary and ghost buttons. Real <button> elements: a disabled button is truly disabled. */
export function Button({ variant = "primary", size = "default", className, type = "button", ...rest }: ButtonProps) {
  const cls = ["btn", variant, size === "small" ? "small" : "", className ?? ""].filter(Boolean).join(" ");
  return <button type={type} className={cls} {...rest} />;
}
