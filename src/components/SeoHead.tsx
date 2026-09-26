import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { applySeo, type SeoConfig } from "@/lib/seo";

type SeoHeadProps = SeoConfig;

export default function SeoHead(props: SeoHeadProps) {
  const location = useLocation();

  useEffect(() => {
    applySeo({\n      title: props.title,\n      description: props.description,\n      canonicalUrl: props.canonicalUrl ?? location.pathname,\n      robots: props.robots,\n      ogTitle: props.ogTitle,\n      ogDescription: props.ogDescription,\n      ogImage: props.ogImage,\n      ogType: props.ogType,\n      twitterCard: props.twitterCard,\n    });
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
