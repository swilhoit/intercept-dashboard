"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  BarChart3,
  TrendingUp,
  Megaphone,
  Globe,
  LineChart,
  ChevronRight,
  ChevronDown,
  Menu,
  X,
  DollarSign,
  Users,
  Target,
  Layers,
  Search,
  Store
} from "lucide-react"

interface NavItem {
  title: string
  value: string
  icon: React.ReactNode
  children?: NavItem[]
}

interface SidebarNavProps {
  currentView: string
  onViewChange: (view: string) => void
  onCollapsedChange?: (collapsed: boolean) => void
}

export function SidebarNav({ currentView, onViewChange, onCollapsedChange }: SidebarNavProps) {
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [isMobileOpen, setIsMobileOpen] = useState(false)
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set(['sales', 'marketing', 'analytics', 'sites']))

  const navItems: NavItem[] = [
    {
      title: "Overview",
      value: "overview",
      icon: <LayoutDashboard className="h-4 w-4" />
    },
    {
      title: "Sites & Channels",
      value: "sites",
      icon: <Store className="h-4 w-4" />,
      children: [
        {
          title: "Amazon",
          value: "site-amazon",
          icon: <ShoppingCart className="h-4 w-4" />
        },
        {
          title: "WooCommerce",
          value: "site-woocommerce",
          icon: <Globe className="h-4 w-4" />
        }
      ]
    },
    {
      title: "Sales",
      value: "sales",
      icon: <DollarSign className="h-4 w-4" />,
      children: [
        {
          title: "Products",
          value: "products",
          icon: <Package className="h-4 w-4" />
        },
        {
          title: "Categories",
          value: "categories",
          icon: <Layers className="h-4 w-4" />
        },
        {
          title: "Product Breakdown",
          value: "breakdown",
          icon: <BarChart3 className="h-4 w-4" />
        },
        {
          title: "Comparison",
          value: "comparison",
          icon: <TrendingUp className="h-4 w-4" />
        }
      ]
    },
    {
      title: "Marketing",
      value: "marketing",
      icon: <Target className="h-4 w-4" />,
      children: [
        {
          title: "Advertising",
          value: "advertising",
          icon: <Megaphone className="h-4 w-4" />
        },
        {
          title: "Amazon Ads Report",
          value: "amazon-ads",
          icon: <Target className="h-4 w-4" />
        },
        {
          title: "Traffic Analytics",
          value: "traffic",
          icon: <Globe className="h-4 w-4" />
        },
        {
          title: "Search Console",
          value: "search-console",
          icon: <Search className="h-4 w-4" />
        }
      ]
    },
    {
      title: "Analytics",
      value: "analytics",
      icon: <LineChart className="h-4 w-4" />
    }
  ]

  const toggleExpanded = (itemValue: string) => {
    const newExpanded = new Set(expandedItems)
    if (newExpanded.has(itemValue)) {
      newExpanded.delete(itemValue)
    } else {
      newExpanded.add(itemValue)
    }
    setExpandedItems(newExpanded)
  }

  const handleItemClick = (item: NavItem) => {
    if (item.children) {
      toggleExpanded(item.value)
    } else {
      onViewChange(item.value)
      setIsMobileOpen(false)
    }
  }

  const renderNavItem = (item: NavItem, level: number = 0) => {
    const hasChildren = item.children && item.children.length > 0
    const isExpanded = expandedItems.has(item.value)
    const isActive = currentView === item.value || 
                    (hasChildren && item.children?.some(child => child.value === currentView))

    return (
      <div key={item.value}>
        <Button
          variant="ghost"
          className={cn(
            "w-full justify-start",
            level > 0 && "pl-8",
            isActive && !hasChildren && "bg-accent",
            isCollapsed && level === 0 && "justify-center px-2"
          )}
          onClick={() => handleItemClick(item)}
        >
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-2">
              {item.icon}
              {!isCollapsed && <span>{item.title}</span>}
            </div>
            {!isCollapsed && hasChildren && (
              <div className="ml-auto">
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </div>
            )}
          </div>
        </Button>
        {!isCollapsed && hasChildren && isExpanded && (
          <div className="mt-1 space-y-1">
            {item.children?.map(child => renderNavItem(child, level + 1))}
          </div>
        )}
      </div>
    )
  }

  return (
    <>
      {/* Mobile Menu Button */}
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden fixed top-4 left-4 z-50"
        onClick={() => setIsMobileOpen(!isMobileOpen)}
      >
        {isMobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
      </Button>

      {/* Sidebar */}
      <div
        className={cn(
          "fixed left-0 top-0 z-40 h-full bg-background border-r transition-all duration-300",
          isCollapsed ? "w-16" : "w-64",
          isMobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        )}
      >
        <div className="flex h-full flex-col">
          {/* Header */}
          <div className="flex h-16 items-center justify-between border-b px-4">
            {!isCollapsed && (
              <h2 className="text-lg font-semibold">Dashboard</h2>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="hidden md:flex"
              onClick={() => {
                const newCollapsed = !isCollapsed
                setIsCollapsed(newCollapsed)
                onCollapsedChange?.(newCollapsed)
              }}
            >
              <Menu className="h-4 w-4" />
            </Button>
          </div>

          {/* Navigation */}
          <div className="flex-1 overflow-y-auto p-4">
            <nav className="space-y-2">
              {navItems.map(item => renderNavItem(item))}
            </nav>
          </div>
        </div>
      </div>

      {/* Mobile Overlay */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={() => setIsMobileOpen(false)}
        />
      )}
    </>
  )
}