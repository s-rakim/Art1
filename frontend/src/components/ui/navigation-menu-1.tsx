"use client";

// Navigation menu from 21st.dev (ReUI, on Base UI). Kept the structure and the motion: the popup
// slides between panels and resizes to each one. Changed for this app:
// - @base-ui/react is the stable package the old @base-ui-components/react became.
// - Nextcloud colours: the triggers sit on the blue header, the popup is a white menu with
//   Nextcloud's menu shadow, links highlight in primary-element-light.
// - The chevron is the MDI one the rest of the app uses, so lucide isn't pulled in for one icon.

import * as React from "react";
import { NavigationMenu as NavigationMenuPrimitive } from "@base-ui/react/navigation-menu";
import { cva } from "class-variance-authority";
import { ChevronDown } from "@/components/icons";
import { cn } from "@/lib/utils";

// Base UI also takes className as a function of state; these wrappers only ever pass strings.
type Props<T extends React.ElementType> = Omit<React.ComponentProps<T>, "className"> & { className?: string };

function NavigationMenu({ className, children, ...props }: Props<typeof NavigationMenuPrimitive.Root>) {
  return (
    <NavigationMenuPrimitive.Root
      data-slot="navigation-menu"
      className={cn("group/navigation-menu relative flex max-w-max flex-1 items-center", className)}
      {...props}
    >
      {children}
    </NavigationMenuPrimitive.Root>
  );
}

function NavigationMenuList({ className, ...props }: Props<typeof NavigationMenuPrimitive.List>) {
  return (
    <NavigationMenuPrimitive.List
      data-slot="navigation-menu-list"
      className={cn("group flex flex-1 list-none items-center gap-0.5", className)}
      {...props}
    />
  );
}

function NavigationMenuItem({ className, ...props }: Props<typeof NavigationMenuPrimitive.Item>) {
  return <NavigationMenuPrimitive.Item data-slot="navigation-menu-item" className={cn("relative", className)} {...props} />;
}

/** White text on the header's blue, a soft white wash on hover and while its panel is open. */
const navigationMenuTriggerStyle = cva(
  [
    "group inline-flex h-[34px] w-max items-center justify-center gap-1 rounded-pill px-3 text-[15px] font-semibold",
    "text-background-plain-text outline-none transition-colors duration-150",
    "hover:bg-white/15 data-[popup-open]:bg-white/20 aria-[current=page]:bg-white/15",
    "focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-background-plain-text",
    "disabled:pointer-events-none disabled:opacity-50",
  ].join(" "),
);

function NavigationMenuTrigger({ className, children, ...props }: Props<typeof NavigationMenuPrimitive.Trigger>) {
  return (
    <NavigationMenuPrimitive.Trigger
      data-slot="navigation-menu-trigger"
      className={cn(navigationMenuTriggerStyle(), className)}
      {...props}
    >
      {children}
      <ChevronDown size={16} className="relative top-px -mr-1 transition-transform duration-300 group-data-[popup-open]:rotate-180 motion-reduce:transition-none" />
    </NavigationMenuPrimitive.Trigger>
  );
}

function NavigationMenuContent({ className, ...props }: Props<typeof NavigationMenuPrimitive.Content>) {
  return (
    <NavigationMenuPrimitive.Content
      data-slot="navigation-menu-content"
      className={cn(
        "h-full w-[calc(100vw_-_40px)] p-2 sm:w-max",
        "transition-[opacity,transform,translate] duration-[var(--duration)] ease-[var(--easing)]",
        "data-[starting-style]:opacity-0 data-[ending-style]:opacity-0",
        "data-[starting-style]:data-[activation-direction=left]:translate-x-[-50%]",
        "data-[starting-style]:data-[activation-direction=right]:translate-x-[50%]",
        "data-[ending-style]:data-[activation-direction=left]:translate-x-[50%]",
        "data-[ending-style]:data-[activation-direction=right]:translate-x-[-50%]",
        "motion-reduce:transition-none",
        className,
      )}
      {...props}
    />
  );
}

function NavigationMenuPortal(props: Props<typeof NavigationMenuPrimitive.Portal>) {
  return <NavigationMenuPrimitive.Portal data-slot="navigation-menu-portal" {...props} />;
}

const MOTION = { "--duration": "0.35s", "--easing": "cubic-bezier(0.22, 1, 0.36, 1)" } as React.CSSProperties;

function NavigationMenuPositioner({ className, children, style, ...props }: Omit<Props<typeof NavigationMenuPrimitive.Positioner>, "style"> & { style?: React.CSSProperties }) {
  return (
    <NavigationMenuPortal>
      <NavigationMenuPrimitive.Positioner
        data-slot="navigation-menu-positioner"
        sideOffset={8}
        collisionPadding={{ top: 5, bottom: 5, left: 16, right: 16 }}
        collisionAvoidance={{ side: "none" }}
        className={cn(
          "z-50 box-border h-[var(--positioner-height)] w-[var(--positioner-width)] max-w-[var(--available-width)]",
          "transition-[top,left,right,bottom] duration-[var(--duration)] ease-[var(--easing)] data-[instant]:transition-none motion-reduce:transition-none",
          // An invisible strip across the gap, so the pointer can travel from trigger to panel.
          "before:absolute before:content-[''] data-[side=bottom]:before:top-[-8px] data-[side=bottom]:before:right-0 data-[side=bottom]:before:left-0 data-[side=bottom]:before:h-2",
          className,
        )}
        style={{ ...MOTION, ...style }}
        {...props}
      >
        {children}
      </NavigationMenuPrimitive.Positioner>
    </NavigationMenuPortal>
  );
}

function NavigationMenuPopup({ className, children, ...props }: Props<typeof NavigationMenuPrimitive.Popup>) {
  return (
    <NavigationMenuPrimitive.Popup
      data-slot="navigation-menu-popup"
      className={cn(
        "relative h-[var(--popup-height)] w-[var(--popup-width)] origin-[var(--transform-origin)] rounded-large bg-main-background text-main-text shadow-menu",
        "transition-[opacity,transform,width,height,scale,translate] duration-[var(--duration)] ease-[var(--easing)]",
        "data-[starting-style]:scale-95 data-[starting-style]:opacity-0 data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[ending-style]:duration-150",
        "motion-reduce:transition-none",
        className,
      )}
      {...props}
    >
      {children}
      <NavigationMenuViewport />
    </NavigationMenuPrimitive.Popup>
  );
}

function NavigationMenuViewport({ className, ...props }: Props<typeof NavigationMenuPrimitive.Viewport>) {
  return <NavigationMenuPrimitive.Viewport className={cn("relative h-full w-full overflow-hidden rounded-large", className)} {...props} />;
}

function NavigationMenuLink({ className, ...props }: Props<typeof NavigationMenuPrimitive.Link>) {
  return (
    <NavigationMenuPrimitive.Link
      data-slot="navigation-menu-link"
      className={cn(
        "flex gap-2.5 rounded-element p-2 text-[15px] outline-none transition-colors duration-150",
        "hover:bg-background-hover focus-visible:bg-background-hover focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary-element",
        "data-[active]:bg-primary-element-light data-[active]:text-primary-element-light-text",
        className,
      )}
      {...props}
    />
  );
}

function NavigationMenuArrow({ className, ...props }: Props<typeof NavigationMenuPrimitive.Arrow>) {
  return (
    <NavigationMenuPrimitive.Arrow
      data-slot="navigation-menu-arrow"
      className={cn(
        "flex transition-[left] duration-[var(--duration)] ease-[var(--easing)] data-[side=bottom]:top-[-8px] data-[side=top]:bottom-[-8px] data-[side=top]:rotate-180",
        className,
      )}
      {...props}
    >
      <ArrowSvg />
    </NavigationMenuPrimitive.Arrow>
  );
}

function ArrowSvg(props: React.ComponentProps<"svg">) {
  return (
    <svg width="20" height="10" viewBox="0 0 20 10" fill="none" aria-hidden {...props}>
      <path d="M9.66437 2.60207L4.80758 6.97318C4.07308 7.63423 3.11989 8 2.13172 8H0V10H20V8H18.5349C17.5468 8 16.5936 7.63423 15.8591 6.97318L11.0023 2.60207C10.622 2.2598 10.0447 2.25979 9.66437 2.60207Z" className="fill-main-background" />
    </svg>
  );
}

export {
  NavigationMenu,
  NavigationMenuArrow,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuPopup,
  NavigationMenuPositioner,
  NavigationMenuTrigger,
  navigationMenuTriggerStyle,
};
