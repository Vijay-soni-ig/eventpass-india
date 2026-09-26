import { useEffect } from "react";

type StructuredDataProps = {
  id: string;
  data: Record<string, unknown>;
};

export default function StructuredData({ id, data }: StructuredDataProps) {
  useEffect(() => {
    let script = document.head.querySelector<HTMLScriptElement>(`script[data-structured-data="${CSS.escape(id)}"]`);
    if (!script) {
      script = document.createElement("script");
      script.type = "application/ld+json";
      script.setAttribute("data-structured-data", id);
      document.head.appendChild(script);
    }
    script.textContent = JSON.stringify(data);
    return () => {
      script?.remove();
    };
  }, [id, data]);

  return null;
}
