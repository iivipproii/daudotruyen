import React from 'react';

const ICONS = {
  alert: 'alert-circle-line.svg',
  arrowUp: 'arrow-up-line.svg',
  arrowLeft: 'chevron-left-line.svg',
  arrowRight: 'chevron-right-line.svg',
  award: 'award-line.svg',
  bell: 'bell-line.svg',
  book: 'book-line.svg',
  bookOpen: 'book-open-line.svg',
  bookmark: 'bookmark-line.svg',
  box: 'box-line.svg',
  calendar: 'calendar-line.svg',
  category: 'tag-line.svg',
  chatText: 'chat-text-line.svg',
  check: 'clipboard-check-line.svg',
  checklist: 'checkbox-list-line.svg',
  chevronDown: 'chevron-down-line.svg',
  chevronLeft: 'chevron-left-line.svg',
  chevronRight: 'chevron-right-line.svg',
  clock: 'clock-line.svg',
  close: 'close-line.svg',
  coins: 'coins-line.svg',
  combo: 'box-line.svg',
  compass: 'compass-2-line.svg',
  creditcard: 'creditcard-line.svg',
  crown: 'crown-line.svg',
  cpu: 'cpu-line.svg',
  droplet: 'lidquid-drop-waves-2-line.svg',
  edit: 'edit-pen-2-line.svg',
  eye: 'eye-line.svg',
  eyeOff: 'eye-off-line.svg',
  fontSize: 'font-size-line.svg',
  grid: 'globe-grid-line.svg',
  heart: 'heart-line.svg',
  home: 'home-line.svg',
  homeSimple: 'home-simple-line.svg',
  list: 'list-box-line.svg',
  lock: 'lock-line.svg',
  login: 'login-line.svg',
  logout: 'logout-line.svg',
  mail: 'mail-line.svg',
  menu: 'menu-line.svg',
  money: 'money-line.svg',
  moneyMinus: 'money-minus-line.svg',
  moneyPlus: 'money-plus-line.svg',
  moon: 'moon-line.svg',
  more: 'more-menu-line.svg',
  panel: 'browser-line.svg',
  panelWide: 'arrows-expand-full-line.svg',
  play: 'play-circle-line.svg',
  playlist: 'playlist-line.svg',
  ranking: 'presentation-chart-line.svg',
  receipt: 'receipt-text-line.svg',
  search: 'search-line.svg',
  send: 'send-line.svg',
  settings: 'settings-cog-line.svg',
  share: 'share-line.svg',
  shield: 'shield-line.svg',
  shoppingCart: 'shopping-cart-line.svg',
  star: 'shooting-star-line.svg',
  sun: 'lightbulb-shine-line.svg',
  text: 'text-align-left-line.svg',
  trash: 'delete-bin-line.svg',
  user: 'user-line.svg',
  users: 'users-line.svg'
};

export function Majesticon({ name, className = '', size = 20, title, style, ...props }) {
  const file = ICONS[name] || ICONS.book;
  const dimension = typeof size === 'number' ? `${size}px` : size;

  return (
    <span
      aria-hidden={title ? undefined : 'true'}
      aria-label={title}
      className={className ? `mj-icon ${className}` : 'mj-icon'}
      role={title ? 'img' : undefined}
      style={{
        '--mj-icon-url': `url('/icons/majesticons/${file}')`,
        width: dimension,
        height: dimension,
        ...style
      }}
      {...props}
    />
  );
}
