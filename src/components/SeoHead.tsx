import { useEffect } from "react";
import { applySeo, type SeoConfig } from "@/lib/seo";

interface SeoHeadProps extends SeoConfig {}

export default function SeoHead(props: SeoHeadProps) {
  useEffect(() => {
    applySeo(props);
  }, [
    props.title,
    props.description,
    props.canonicalUrl,
    props.robots,
    props.ogTitle,
    props.ogDescription,
    props.ogImage,
    props.ogType,
    props.twitterCard,
  ]);

  return null;
}
