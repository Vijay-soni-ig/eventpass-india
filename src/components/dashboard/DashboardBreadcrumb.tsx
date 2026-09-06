import { Fragment } from "react";
import { Link } from "react-router-dom";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";

interface DashboardBreadcrumbProps {
  /** Ancestor links, e.g. [{ label: "Exhibitions", to: "/organizer/exhibitions" }]. */
  items: { label: string; to: string }[];
  /** The current page — rendered as non-interactive text, not a link. */
  page: string;
}

/** Shared breadcrumb trail for organizer/exhibitor detail pages nested under
 *  a list route (e.g. Exhibitions / Bengaluru Expo 2026). */
export function DashboardBreadcrumb({ items, page }: DashboardBreadcrumbProps) {
  return (
    <Breadcrumb>
      <BreadcrumbList>
        {items.map((item) => (
          <Fragment key={item.to}>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link to={item.to}>{item.label}</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
          </Fragment>
        ))}
        <BreadcrumbItem>
          <BreadcrumbPage>{page}</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  );
}
