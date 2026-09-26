import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { applySeo, type SeoConfig } from "@/lib/seo";

interface SeoHeadProps extends SeoConfig {}

export default function SeoHead(props: SeoHeadProps) {
  const location = useLocation();

  useEffect(() => {
    applySeo({ ...props, canonicalUrl: props.canonicalUrl ?? location.pathname });
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
    location.pathname,
  ]);

  return null;
}
