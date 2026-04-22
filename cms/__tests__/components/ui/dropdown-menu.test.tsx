/** @jest-environment jsdom */

/**
 * DropdownMenu Unit Test Suite
 *
 * Business Domain / Responsibility
 * - Verifies the UI primitive for dropdown menus used across the CMS.
 * - The unit under test is a set of wrapper components around `@radix-ui/react-dropdown-menu`.
 * - Responsible for applying project-specific styling, animations, and icons.
 *
 * Regulatory / Compliance Context (Accessibility)
 * - These tests ensure ARIA attributes are correctly passed through from Radix primitives.
 * - Ensures interactive elements (items, triggers) are accessible via keyboard and pointer.
 *
 * Architecture Notes (Boundaries & Doubles)
 * - `@radix-ui/react-dropdown-menu` is treated as an implementation detail but largely used "real" to verify composition.
 * - `lucide-react` icons are mocked to isolate visual assets from logic.
 * - `ResizeObserver` is mocked as it is required by Radix UI for positioning calculations in JSDOM.
 *
 * Test Data Strategy / Fixtures
 * - Simple string labels for menu items.
 * - Mock functions for event handlers.
 */

import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuGroup,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuRadioGroup,
} from '@/components/ui/dropdown-menu';

// Mock Lucide icons to avoid rendering complexities
jest.mock('lucide-react', () => ({
  Check: () => <span data-testid="check-icon">CheckIcon</span>,
  ChevronRight: () => <span data-testid="chevron-right-icon">ChevronRightIcon</span>,
  Circle: () => <span data-testid="circle-icon">CircleIcon</span>,
}));

// Mock ResizeObserver for Radix UI
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Mock Pointer Capture methods (harmless but needed for Radix)
window.HTMLElement.prototype.scrollIntoView = jest.fn();
window.HTMLElement.prototype.releasePointerCapture = jest.fn();
window.HTMLElement.prototype.hasPointerCapture = jest.fn();

describe('DropdownMenu Component', () => {
  /**
   * Scenario: Menu opens and displays content when trigger is clicked.
   *
   * Given: A DropdownMenu with a Trigger and Content containing an Item
   * When: The Trigger is clicked (simulated via Keyboard 'Enter' for reliability in JSDOM)
   * Then: The Content and Item become visible in the document.
   */
  it('renders menu content when trigger is activated', async () => {
    render(
      <DropdownMenu>
        <DropdownMenuTrigger>Open Menu</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem>Menu Item 1</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );

    const trigger = screen.getByRole('button', { name: /open menu/i });
    
    // Use Keyboard interaction which is reliable for Radix in JSDOM
    fireEvent.keyDown(trigger, { key: 'Enter' });

    expect(await screen.findByRole('menuitem', { name: /menu item 1/i })).toBeInTheDocument();
  });

  /**
   * Scenario: Menu Item click triggers action.
   *
   * Given: An open menu with an Item having an onClick handler
   * When: The Item is clicked
   * Then: The onClick handler is fired.
   */
  it('fires onClick handler when item is clicked', async () => {
    const handleClick = jest.fn();
    render(
      <DropdownMenu open={true}>
        <DropdownMenuContent>
          <DropdownMenuItem onClick={handleClick}>Click Me</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );

    const item = screen.getByRole('menuitem', { name: /click me/i });
    fireEvent.click(item);

    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  /**
   * Scenario: Inset prop adds padding to Item.
   *
   * Given: A DropdownMenuItem with `inset={true}`
   * When: The item is rendered
   * Then: It has the specific padding class (pl-8).
   */
  it('applies inset styling to MenuItem correctly', () => {
    render(
      <DropdownMenu open={true}>
        <DropdownMenuContent>
          <DropdownMenuItem inset>Inset Item</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );

    const item = screen.getByRole('menuitem', { name: /inset item/i });
    expect(item).toHaveClass('pl-8');
  });

  /**
   * Scenario: Inset prop adds padding to SubTrigger.
   *
   * Given: A DropdownMenuSubTrigger with `inset={true}`
   * When: The trigger is rendered
   * Then: It has the specific padding class (pl-8).
   */
  it('applies inset styling to SubTrigger correctly', () => {
    render(
      <DropdownMenu open={true}>
        <DropdownMenuContent>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger inset>Sub Trigger</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuItem>Sub Item</DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuContent>
      </DropdownMenu>
    );

    const trigger = screen.getByRole('menuitem', { name: /sub trigger/i });
    expect(trigger).toHaveClass('pl-8');
  });

  /**
   * Scenario: CheckboxItem renders check icon when checked.
   *
   * Given: A DropdownMenuCheckboxItem with `checked={true}`
   * When: The item is rendered
   * Then: The Check icon (mocked) is visible.
   */
  it('displays check icon when CheckboxItem is checked', () => {
    render(
      <DropdownMenu open={true}>
        <DropdownMenuContent>
          <DropdownMenuCheckboxItem checked>Checked Item</DropdownMenuCheckboxItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );

    expect(screen.getByTestId('check-icon')).toBeInTheDocument();
  });

  /**
   * Scenario: CheckboxItem does not render check icon when unchecked.
   *
   * Given: A DropdownMenuCheckboxItem with `checked={false}`
   * When: The item is rendered
   * Then: The Check icon (mocked) is NOT visible.
   */
  it('does not display check icon when CheckboxItem is unchecked', () => {
    render(
      <DropdownMenu open={true}>
        <DropdownMenuContent>
          <DropdownMenuCheckboxItem checked={false}>Unchecked Item</DropdownMenuCheckboxItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );

    expect(screen.queryByTestId('check-icon')).not.toBeInTheDocument();
  });

  /**
   * Scenario: RadioItem renders circle icon.
   *
   * Given: A DropdownMenuRadioItem inside a RadioGroup
   * When: The item is rendered
   * Then: The Circle icon (mocked) is visible.
   */
  it('displays circle icon for RadioItem', () => {
    render(
      <DropdownMenu open={true}>
        <DropdownMenuContent>
          <DropdownMenuRadioGroup value="opt1">
            <DropdownMenuRadioItem value="opt1">Option 1</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    );

    expect(screen.getByTestId('circle-icon')).toBeInTheDocument();
  });

  /**
   * Scenario: Label and Separator rendering.
   *
   * Given: A menu with a Label and a Separator
   * When: Rendered
   * Then: The label text is visible and separator has correct styling/role.
   */
  it('renders label and separator correctly', () => {
    render(
      <DropdownMenu open={true}>
        <DropdownMenuContent>
          <DropdownMenuLabel>My Label</DropdownMenuLabel>
          <DropdownMenuSeparator />
        </DropdownMenuContent>
      </DropdownMenu>
    );

    expect(screen.getByText('My Label')).toBeInTheDocument();
    expect(screen.getByRole('separator')).toBeInTheDocument();
  });

  /**
   * Scenario: Shortcut rendering.
   *
   * Given: A DropdownMenuShortcut component
   * When: Rendered
   * Then: It displays the text and has the correct class.
   */
  it('renders shortcut with correct styling', () => {
    render(
      <DropdownMenu open={true}>
        <DropdownMenuContent>
          <DropdownMenuItem>
            Item <DropdownMenuShortcut>⌘K</DropdownMenuShortcut>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );

    const shortcut = screen.getByText('⌘K');
    expect(shortcut).toBeInTheDocument();
    expect(shortcut).toHaveClass('ml-auto', 'text-xs', 'tracking-widest', 'opacity-60');
  });

  /**
   * Scenario: Trigger has correct accessibility attributes.
   *
   * Given: A rendered DropdownMenuTrigger
   * When: Inspected
   * Then: It has aria-haspopup and aria-expanded attributes.
   */
  it('provides accessible attributes on trigger', async () => {
    render(
      <DropdownMenu>
        <DropdownMenuTrigger>Trigger</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem>Item</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );

    const trigger = screen.getByRole('button', { name: /trigger/i });
    expect(trigger).toHaveAttribute('aria-haspopup');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    // Toggle open
    fireEvent.keyDown(trigger, { key: 'Enter' });
    
    // Check if it changes state
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });

  /**
   * Scenario: Sub-menu opens on hover/interaction.
   *
   * Given: A menu with a sub-menu
   * When: The sub-menu trigger is clicked (simulating interaction)
   * Then: The sub-menu content becomes visible.
   */
  it('opens sub-menu content when sub-trigger is activated', async () => {
    render(
      <DropdownMenu open={true}>
        <DropdownMenuContent>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Sub Trigger</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuItem>Sub Item</DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuContent>
      </DropdownMenu>
    );

    const subTrigger = screen.getByRole('menuitem', { name: /sub trigger/i });
    
    // Try keyboard interaction for sub-menus (Right Arrow usually opens submenus)
    fireEvent.keyDown(subTrigger, { key: 'ArrowRight' });

    // Wait for the animation/state
    expect(await screen.findByRole('menuitem', { name: /sub item/i })).toBeInTheDocument();
  });
});
