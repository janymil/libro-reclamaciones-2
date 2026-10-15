import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import {
  PRIMARY_MOBILE_NAV,
  SECONDARY_MOBILE_NAV,
  isPrimaryLocation,
} from "@/lib/navigation";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

/**
 * Phone navigation.
 *
 * Four daily destinations plus a "Más" sheet: five targets fit the shortest
 * phone (320px) with a >=44px touch height, which six items in one row did not.
 * Items are `Link` elements directly - the previous version nested an `<a>`
 * inside wouter's `<a>`, which is invalid HTML and broke keyboard/AT navigation.
 */
export default function MobileNavigation() {
  const [location] = useLocation();
  const secondaryActive = !isPrimaryLocation(location)
    && SECONDARY_MOBILE_NAV.some((item) => item.href === location);

  const tabClass = (isActive: boolean) =>
    cn(
      "flex min-h-[48px] flex-col items-center justify-center gap-0.5 px-1 py-1.5 transition-colors",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c02b0a] focus-visible:ring-inset",
      isActive ? "font-semibold text-[#c02b0a]" : "text-[#5c5246]",
    );

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-[#e3d9c6] bg-[#fdfaf3] pb-[env(safe-area-inset-bottom)] lg:hidden"
      data-testid="mobile-navigation"
    >
      <nav aria-label="Navegación móvil" className="grid grid-cols-5">
        {PRIMARY_MOBILE_NAV.map((item) => {
          const isActive = location === item.href;

          return (
            <Link
              key={item.name}
              href={item.href}
              className={tabClass(isActive)}
              aria-current={isActive ? "page" : undefined}
              data-testid={`mobile-nav-${item.name.toLowerCase()}`}
            >
              <span className="material-icons text-xl leading-none" aria-hidden="true">
                {item.icon}
              </span>
              <span className="text-[11px] leading-tight">{item.name}</span>
            </Link>
          );
        })}

        <Sheet>
          <SheetTrigger asChild>
            <button
              type="button"
              className={tabClass(secondaryActive)}
              aria-haspopup="dialog"
              aria-label="Más opciones de navegación"
              data-testid="mobile-nav-mas"
            >
              <span className="material-icons text-xl leading-none" aria-hidden="true">
                more_horiz
              </span>
              <span className="text-[11px] leading-tight">Más</span>
            </button>
          </SheetTrigger>
          <SheetContent side="bottom" className="max-h-[80vh] overflow-y-auto pb-8">
            <SheetHeader>
              <SheetTitle>Menú</SheetTitle>
            </SheetHeader>
            <ul className="mt-2 space-y-1">
              {SECONDARY_MOBILE_NAV.map((item) => {
                const isActive = location === item.href;

                return (
                  <li key={item.name}>
                    <Link
                      href={item.href}
                      className={cn(
                        "flex min-h-[44px] items-center rounded-md px-3 text-sm",
                        isActive
                          ? "bg-[#c02b0a] font-medium text-white"
                          : "text-[#3d342b] hover:bg-[#f3eadc]",
                      )}
                      aria-current={isActive ? "page" : undefined}
                      data-testid={`mobile-nav-more-${item.name.toLowerCase().replace(/ /g, "-")}`}
                    >
                      <span className="material-icons mr-3 text-[18px] leading-none" aria-hidden="true">
                        {item.icon}
                      </span>
                      <span>{item.name}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </SheetContent>
        </Sheet>
      </nav>
    </div>
  );
}

