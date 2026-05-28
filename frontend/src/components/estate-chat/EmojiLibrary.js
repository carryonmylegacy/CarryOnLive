import React, { useState, useRef, useEffect, useMemo } from 'react';
import { SmilePlus, Search } from 'lucide-react';

const RECENT_KEY = 'ect_recent_emojis';
const MAX_RECENT = 8;
const DEFAULT_RECENT = ['👍', '❤️', '😂', '😢', '🔥', '✅', '🙏', '👏'];

export function getRecentEmojis() {
  try {
    const stored = localStorage.getItem(RECENT_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed.slice(0, MAX_RECENT);
    }
  } catch {}
  return DEFAULT_RECENT.slice(0, MAX_RECENT);
}

export function addRecentEmoji(emoji) {
  const recent = getRecentEmojis().filter(e => e !== emoji);
  recent.unshift(emoji);
  const updated = recent.slice(0, MAX_RECENT);
  localStorage.setItem(RECENT_KEY, JSON.stringify(updated));
  return updated;
}

// Legacy key → unicode mapping for backward compatibility
export const LEGACY_EMOJI_MAP = {
  thumbs_up: '👍', heart: '❤️', laugh: '😂', sad: '😢', fire: '🔥', check: '✅',
};

export function displayEmoji(emojiKey) {
  return LEGACY_EMOJI_MAP[emojiKey] || emojiKey;
}

export const EMOJI_CATEGORIES = [
  { id: 'smileys', name: 'Smileys', emojis: [
    '😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃','😉','😊','😇','🥰','😍','🤩',
    '😘','😗','😚','😙','🥲','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🤫','🤔','🤐',
    '😐','😑','😶','😏','😒','🙄','😬','🤥','😌','😔','😪','🤤','😴','😷','🤒','🤕',
    '🤢','🤮','🤧','🥵','🥶','🥴','😵','🤯','🤠','🥳','🥸','😎','🤓','🧐','😕','😟',
    '🙁','😮','😯','😲','😳','🥺','🥹','😦','😧','😨','😰','😥','😢','😭','😱','😖',
    '😣','😞','😓','😩','😫','🥱','😤','😡','😠','🤬','😈','👿','💀','💩','🤡','👹',
    '👺','👻','👽','👾','🤖','😺','😸','😹','😻','😼','😽','🙀','😿','😾',
  ]},
  { id: 'gestures', name: 'Gestures', emojis: [
    '👋','🤚','🖐','✋','🖖','👌','🤌','🤏','✌','🤞','🤟','🤘','🤙',
    '👈','👉','👆','🖕','👇','☝','👍','👎','✊','👊','🤛','🤜','👏','🙌','👐','🤲',
    '🤝','🙏','✍','💅','🤳','💪','🦾','🦵','🦶','👂','🦻','👃','👀','👁','👅','👄',
    '💋','🫂','👤','👥','🗣','👶','🧒','👦','👧','🧑','👱','👨','🧔','👩','🧓','👴','👵',
  ]},
  { id: 'animals', name: 'Animals & Nature', emojis: [
    '🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐽','🐸','🐵',
    '🙈','🙉','🙊','🐒','🐔','🐧','🐦','🐤','🐣','🐥','🦆','🦅','🦉','🦇','🐺','🐗',
    '🐴','🦄','🐝','🐛','🦋','🐌','🐞','🐜','🦟','🕷','🦂','🐢','🐍','🦎','🦖','🦕',
    '🐙','🦑','🦐','🦞','🦀','🐡','🐠','🐟','🐬','🐳','🐋','🦈','🐊','🐅','🐆','🦓',
    '🦍','🐘','🦛','🦏','🐪','🐫','🦒','🦘','🐃','🐂','🐄','🐎','🐖','🐏','🐑','🦙',
    '🐐','🦌','🐕','🐩','🐈','🐓','🦃','🦚','🦜','🦢','🦩','🐇','🦝','🦨','🦥','🐁',
    '🐀','🐿','🦔','🐾','🐉','🐲',
    '🌵','🎄','🌲','🌳','🌴','🌱','🌿','☘','🍀','🎍','🎋','🍃','🍂','🍁','🍄','🐚',
    '💐','🌷','🌹','🥀','🌺','🌸','🌼','🌻','🌞','🌝','🌛','🌜','🌚','🌕','🌙',
    '⭐','🌟','✨','⚡','🔥','🌪','🌈','☀','☁','❄','☃','💧','💦','🌊',
  ]},
  { id: 'food', name: 'Food & Drink', emojis: [
    '🍏','🍎','🍐','🍊','🍋','🍌','🍉','🍇','🍓','🫐','🍈','🍒','🍑','🥭','🍍','🥥',
    '🥝','🍅','🍆','🥑','🥦','🥬','🥒','🌶','🌽','🥕','🧄','🧅','🥔','🍠','🥐','🥯',
    '🍞','🥖','🥨','🧀','🥚','🍳','🧈','🥞','🧇','🥓','🥩','🍗','🍖','🌭','🍔','🍟',
    '🍕','🥪','🥙','🧆','🌮','🌯','🥗','🥘','🍝','🍜','🍲','🍛','🍣','🍱','🥟','🍤',
    '🍙','🍚','🍘','🍥','🍢','🍡','🍧','🍨','🍦','🥧','🧁','🍰','🎂','🍮','🍭','🍬',
    '🍫','🍿','🍩','🍪','🌰','🥜','🍯','🥛','🍼','☕','🍵','🧃','🥤','🍶','🍺','🍻',
    '🥂','🍷','🥃','🍸','🍹','🍾',
  ]},
  { id: 'activities', name: 'Activities', emojis: [
    '⚽','🏀','🏈','⚾','🥎','🎾','🏐','🏉','🎱','🏓','🏸','🏒','🏑','🥍','🏏','⛳',
    '🏹','🎣','🥊','🥋','🎽','🛹','🛷','⛸','🥌','🎿','🏂','🏋','🤼','🤸','🤺','⛹',
    '🏊','🚣','🧗','🚵','🚴','🏆','🥇','🥈','🥉','🏅','🎖','🎗','🎫','🎪','🤹','🎭',
    '🎨','🎬','🎤','🎧','🎼','🎹','🥁','🎷','🎺','🎸','🎻','🎲','♟','🎯','🎳','🎮','🎰',
  ]},
  { id: 'travel', name: 'Travel & Places', emojis: [
    '🚗','🚕','🚙','🚌','🚎','🏎','🚓','🚑','🚒','🚐','🛻','🚚','🚛','🚜','🏍','🛵',
    '🚲','🛴','🚏','🚦','🚥','🚨','🚔','🚍','🚘','🚖','🚡','🚠','🚟','🚃','🚋','🚞',
    '🚝','🚄','🚅','🚈','🚂','🚆','🚇','🚊','🚉','✈','🛫','🛬','🛩','💺','🛰','🚀',
    '🛸','🚁','🛶','⛵','🚤','🛥','🛳','🚢','⚓','⛽','🗺','🗿','🗽','🗼','🏰','🏯',
    '🏟','🎡','🎢','🎠','⛲','⛺','🏔','🌋','🏕','🏖','🏜','🏝','🏗','🏘','🏠','🏡',
    '🏢','🏣','🏤','🏥','🏦','🏨','🏩','🏪','🏫','🏬','🏭','💒','⛪','🕌','🕍','⛩',
  ]},
  { id: 'objects', name: 'Objects', emojis: [
    '⌚','📱','📲','💻','⌨','🖥','🖨','🖱','🕹','💽','💾','💿','📀','📼','📷','📸',
    '📹','🎥','📽','📞','☎','📟','📠','📺','📻','🎙','🎚','🎛','🧭','⏱','⏲','⏰',
    '⌛','⏳','📡','🔋','🔌','💡','🔦','🕯','🧯','💸','💵','💴','💶','💷','💰','💳',
    '💎','⚖','🧰','🔧','🔩','⚙','🔫','💣','🔪','🛡','🚬','⚱','🔮','📿','💈','⚗',
    '🔭','🔬','💊','💉','🧬','🦠','🧫','🧪','🌡','🧹','🧺','🧻','🚽','🚿','🛁','🧼',
    '🔑','🗝','🚪','🛋','🛏','🖼','🧸','🎀','🎁','🎈','🎏','🎐','🧧','✉','📩','📨',
    '📧','💌','📥','📦','📮','📯','📜','📃','📄','📊','📈','📉','📋','📁','📂','📰',
    '📓','📔','📒','📕','📗','📘','📙','📚','📖','🔖','🔗','📎','📐','📏','📌','📍',
    '✂','🖊','🖋','✒','🖌','🖍','📝','✏','🔍','🔎','🔒','🔓',
  ]},
  { id: 'symbols', name: 'Hearts & Symbols', emojis: [
    '❤️','🩷','🧡','💛','💚','💙','🩵','💜','🖤','🤍','🤎','💔','❤️‍🔥','❤️‍🩹','❣','💕',
    '💞','💓','💗','💖','💘','💝','💟','☮','✝','☪','🕉','☸','✡','🔯','🕎','☯',
    '♈','♉','♊','♋','♌','♍','♎','♏','♐','♑','♒','♓','⛎','🔀','🔁','🔂',
    '▶','⏩','⏭','◀','⏪','⏮','🔼','🔽','⏸','⏹','⏺','⏏','🔅','🔆',
    '♻','✅','❌','❓','❕','❗','‼','⁉','💯','🔴','🟠','🟡','🟢','🔵','🟣','🟤',
    '⚫','⚪','🟥','🟧','🟨','🟩','🟦','🟪','🟫','⬛','⬜','◼','◻','▪','▫',
    '🔶','🔷','🔸','🔹','🔺','🔻','💠','🔘','🔳','🔲','🏁','🚩','🎌','🏴','🏳',
    '🏳️‍🌈','🇺🇸','🇬🇧','🇫🇷','🇩🇪','🇮🇹','🇪🇸','🇯🇵','🇰🇷','🇨🇳','🇧🇷','🇮🇳','🇦🇺','🇨🇦','🇲🇽',
  ]},
];

// Keyword index — maps search terms to emoji characters
const EMOJI_KEYWORD_MAP = {
  'smile':'😀😃😄😁😊🙂',  'happy':'😀😃😄😁😆😊🥳',  'sad':'😢😭😞😔😥😿',
  'cry':'😢😭😿🥲',  'laugh':'😂🤣😆😅😹',  'love':'🥰😍😘❤️💕💖💗💝💘💞💓💟',
  'heart':'❤️🩷🧡💛💚💙🩵💜🖤🤍🤎💔❤️‍🔥💕💖💗💘💝💞💓💟❣',
  'angry':'😡😠🤬😤👿',  'cool':'😎🤙🆒',  'wink':'😉😜😏',  'kiss':'😘😗😚😙💋',
  'think':'🤔🧐💭',  'sleep':'😴💤😪🛌',  'sick':'🤒🤕🤢🤮🤧😷',  'hot':'🥵🔥😎',
  'cold':'🥶❄️☃️⛄',  'surprise':'😮😲😳🤯😱',  'fear':'😨😰😱👻',  'devil':'😈👿👹👺',
  'skull':'💀☠️',  'ghost':'👻',  'alien':'👽👾🛸',  'robot':'🤖🦾',  'clown':'🤡🎪',
  'poop':'💩',  'money':'🤑💰💵💴💶💷💸💳💎',  'star':'⭐🌟✨💫',
  'fire':'🔥🧯',  'water':'💧💦🌊🏊🚿',  'sun':'☀️🌞🌅🌄',  'moon':'🌙🌛🌜🌝🌚',
  'rain':'🌧️☔💧',  'snow':'❄️☃️⛄',  'rainbow':'🌈',  'cloud':'☁️⛅',
  'wave':'👋🌊',  'thumb':'👍👎',  'ok':'👌✅',  'clap':'👏',  'pray':'🙏',
  'muscle':'💪🦾',  'point':'👈👉👆👇☝️',  'peace':'✌️☮️',  'rock':'🤘🎸',
  'hand':'👋🤚🖐️✋🖖👌✌️🤞🤟🤘🤙👈👉👆👇☝️👍👎✊👊🤛🤜👏🙌👐🤲🤝🙏',
  'dog':'🐶🐕🐩',  'cat':'🐱🐈😺😸😹😻😼😽🙀😿😾',  'bear':'🐻🐼🐨🧸',
  'bird':'🐦🐤🐣🐥🦆🦅🦉🦜🦢🦩🐓🦃🦚',  'fish':'🐟🐠🐡🐬🐳🐋🦈',
  'bug':'🐛🐜🐝🦋🐌🐞🕷🦂',  'flower':'🌸🌹🌺🌻🌼🌷💐🥀',
  'tree':'🌲🌳🌴🎄🌵',  'fruit':'🍏🍎🍐🍊🍋🍌🍉🍇🍓🍈🍒🍑🍍🥝',
  'food':'🍔🍟🍕🌭🥪🌮🌯🥗🍗🍖🥩🍳🥚🧀🥞🧇🥓',
  'drink':'☕🍵🧃🥤🍺🍻🥂🍷🥃🍸🍹🍾',  'cake':'🎂🧁🍰🍮🍩🍪',
  'pizza':'🍕',  'burger':'🍔',  'sushi':'🍣🍱',  'rice':'🍚🍙🍘',
  'car':'🚗🚕🚙🚓🚑🚒',  'plane':'✈️🛩️',  'rocket':'🚀',  'ship':'🚢⛵',
  'train':'🚂🚃🚄🚅🚆🚇🚈🚉🚊🚋🚞🚝',  'bike':'🚲🚵🚴',  'bus':'🚌🚎🚍',
  'house':'🏠🏡🏘️',  'building':'🏢🏣🏤🏥🏦🏨🏩🏪🏫🏬🏭',
  'ball':'⚽🏀🏈⚾🎾🏐🏉🎱',  'game':'🎮🎲♟🎯🎳🎰🕹',
  'music':'🎼🎹🎷🎺🎸🎻🥁🎤🎧',  'art':'🎨🖌🖍✏',  'movie':'🎬🎥📽🍿',
  'trophy':'🏆🥇🥈🥉🏅🎖',  'gift':'🎁🎀🧧',  'party':'🎉🎊🥳🎈',
  'flag':'🏁🚩🎌🏴🏳🏳️‍🌈🇺🇸🇬🇧🇫🇷🇩🇪🇮🇹🇪🇸🇯🇵🇰🇷🇨🇳🇧🇷🇮🇳🇦🇺🇨🇦🇲🇽',
  'phone':'📱📲📞☎📟',  'computer':'💻🖥⌨🖱🖨',  'camera':'📷📸📹🎥',
  'book':'📚📖📕📗📘📙📓📔📒',  'key':'🔑🗝🔐🔒🔓',  'lock':'🔒🔐🔓🗝',
  'medicine':'💊💉🩹🩺',  'baby':'👶🍼🧒',  'time':'⏰⏱⏲🕰⌛⏳',
  'check':'✅☑️',  'cross':'❌❎',  'warning':'⚠️🚨🚫⛔',  'question':'❓❔',
  'yes':'👍✅👌',  'no':'👎❌🚫⛔',  'eye':'👀👁🔍🔎',
  'crown':'👑🤴👸',  'ring':'💍💎',  'diamond':'💎💠',
  'usa':'🇺🇸',  'uk':'🇬🇧',  'france':'🇫🇷',  'germany':'🇩🇪',  'italy':'🇮🇹',
  'spain':'🇪🇸',  'japan':'🇯🇵',  'korea':'🇰🇷',  'china':'🇨🇳',  'brazil':'🇧🇷',
  'india':'🇮🇳',  'australia':'🇦🇺',  'canada':'🇨🇦',  'mexico':'🇲🇽',
};

function searchEmojis(query) {
  const q = query.toLowerCase().trim();
  if (!q) return null;
  const allSet = new Set(EMOJI_CATEGORIES.flatMap(c => c.emojis));
  const matched = new Set();
  for (const [keyword, emojis] of Object.entries(EMOJI_KEYWORD_MAP)) {
    if (keyword.startsWith(q) || keyword.includes(q)) {
      for (const ch of [...emojis]) {
        if (ch && allSet.has(ch)) matched.add(ch);
      }
    }
  }
  for (const cat of EMOJI_CATEGORIES) {
    if (cat.name.toLowerCase().includes(q) || cat.id.includes(q)) {
      for (const emoji of cat.emojis) matched.add(emoji);
    }
  }
  return [...matched];
}

export function EmojiPickerGrid({ onSelect, onClose: _onClose, isOwn: _isOwn, searchPosition = 'top' }) {
  const [search, setSearch] = useState('');
  const scrollRef = useRef(null);
  const searchRef = useRef(null);

  useEffect(() => {
    if (window.matchMedia('(pointer: fine)').matches && searchRef.current) {
      searchRef.current.focus();
    }
  }, []);

  const filtered = useMemo(() => searchEmojis(search), [search]);

  const searchBar = (
    <div className={searchPosition === 'top' ? 'px-3 pt-3 pb-2' : 'px-3 pt-2 pb-3'} style={{ flexShrink: 0 }}>
      <div className="flex items-center gap-2 rounded-lg px-2.5 py-1.5"
        style={{ background: 'var(--s)', border: '1px solid rgba(255,255,255,0.08)' }}>
        <Search className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--t5)' }} />
        <input
          ref={searchRef}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search emojis..."
          className="bg-transparent text-sm outline-none flex-1"
          style={{ color: 'var(--t)', fontSize: '16px' }}
          data-testid="emoji-search-input"
        />
      </div>
    </div>
  );

  const emojiGrid = (
    <div
      ref={scrollRef}
      className="px-2 overflow-y-auto"
      style={{ maxHeight: '260px', WebkitOverflowScrolling: 'touch' }}
      data-testid="emoji-picker-scroll"
    >
      {filtered ? (
        <div className="grid grid-cols-6 gap-0.5 py-1">
          {filtered.map((emoji, i) => (
            <button
              key={`${emoji}-${i}`}
              onClick={(e) => { e.stopPropagation(); onSelect(emoji); }}
              className="w-10 h-10 rounded-lg flex items-center justify-center text-2xl active:scale-90 transition-transform hover:bg-white/10"
              data-testid={`emoji-pick-${i}`}
            >{emoji}</button>
          ))}
          {filtered.length === 0 && (
            <div className="col-span-6 text-center py-6 text-sm" style={{ color: 'var(--t5)' }}>No emojis found</div>
          )}
        </div>
      ) : (
        EMOJI_CATEGORIES.map((cat) => (
          <div key={cat.id}>
            <div className="text-[11px] font-semibold px-1 py-1.5 sticky top-0 z-[1]" style={{ color: 'var(--t4)', background: 'rgba(20,30,50,1)' }}>{cat.name}</div>
            <div className="grid grid-cols-6 gap-0.5">
              {cat.emojis.map((emoji, i) => (
                <button
                  key={`${cat.id}-${i}`}
                  onClick={(e) => { e.stopPropagation(); onSelect(emoji); }}
                  className="w-10 h-10 rounded-lg flex items-center justify-center text-2xl active:scale-90 transition-transform hover:bg-white/10"
                >{emoji}</button>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );

  return (
    <div
      style={{
        background: 'rgba(20,30,50,0.97)',
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: '16px',
        WebkitBackdropFilter: 'blur(20px)',
        backdropFilter: 'blur(20px)',
        overflow: 'hidden',
        width: 'min(280px, calc(100vw - 24px))',
        display: 'flex',
        flexDirection: 'column',
      }}
      data-testid="emoji-picker-grid"
      onClick={(e) => e.stopPropagation()}
      onTouchEnd={(e) => e.stopPropagation()}
    >
      {searchPosition === 'top' ? (
        <>{searchBar}{emojiGrid}</>
      ) : (
        <>{emojiGrid}{searchBar}</>
      )}
    </div>
  );
}

export function EmojiPickerButton({ onClick }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className="w-9 h-9 rounded-full flex items-center justify-center active:scale-90 transition-transform"
      style={{ background: 'var(--ect-btn-bg)', border: '1px solid var(--b)' }}
      data-testid="emoji-picker-open-btn"
      title="More emojis"
    >
      <SmilePlus className="w-4.5 h-4.5" style={{ color: 'var(--ect-btn-icon)' }} />
    </button>
  );
}

// Small version for inline reaction strip
export function EmojiPickerButtonSmall({ onClick }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className="w-8 h-8 rounded-lg flex items-center justify-center transition-all hover:scale-110 active:scale-95"
      style={{ background: 'var(--s)', border: '1px solid transparent' }}
      data-testid="emoji-picker-open-btn-small"
      title="More emojis"
    >
      <SmilePlus className="w-4 h-4" style={{ color: 'var(--t4)' }} />
    </button>
  );
}
