// Lightweight DOM Mock for testing Chrome Extension content extractors in Node.js

export class Node {
  static ELEMENT_NODE = 1;
  static TEXT_NODE = 3;

  constructor(nodeType) {
    this.nodeType = nodeType;
    this.childNodes = [];
    this.parentElement = null;
  }

  appendChild(child) {
    child.parentElement = this;
    this.childNodes.push(child);
    return child;
  }

  remove() {
    if (this.parentElement) {
      const idx = this.parentElement.childNodes.indexOf(this);
      if (idx !== -1) {
        this.parentElement.childNodes.splice(idx, 1);
      }
      this.parentElement = null;
    }
  }

  get textContent() {
    return this.childNodes.map((c) => c.textContent).join('');
  }

  set textContent(val) {
    this.childNodes = [new TextNode(val)];
  }

  get innerText() {
    return this.textContent;
  }
}

export class TextNode extends Node {
  constructor(text) {
    super(Node.TEXT_NODE);
    this._text = text;
  }

  get textContent() {
    return this._text;
  }

  set textContent(val) {
    this._text = val;
  }

  cloneNode() {
    return new TextNode(this._text);
  }
}

export class Element extends Node {
  constructor(tagName) {
    super(Node.ELEMENT_NODE);
    this.tagName = tagName.toUpperCase();
    this.attributes = new Map();
    this.style = {
      display: '',
      visibility: '',
      opacity: '',
      fontSize: '',
    };
    this.hidden = false;
  }

  getAttribute(name) {
    return this.attributes.get(name.toLowerCase()) || null;
  }

  setAttribute(name, val) {
    this.attributes.set(name.toLowerCase(), String(val));
    if (name.toLowerCase() === 'hidden') {
      this.hidden = true;
    }
    if (name.toLowerCase() === 'style') {
      const parts = String(val).split(';');
      for (const part of parts) {
        const [k, v] = part.split(':').map((s) => s?.trim());
        if (k && v) {
          if (k === 'display') this.style.display = v;
          if (k === 'visibility') this.style.visibility = v;
          if (k === 'opacity') this.style.opacity = v;
          if (k === 'font-size') this.style.fontSize = v;
        }
      }
    }
  }

  matches(selector) {
    selector = selector.trim();
    if (selector === '*') return true;

    // Attribute contains: [attr*="val"]
    const attrContains = selector.match(/^\[([a-zA-Z0-9_-]+)\*="([^"]+)"\]$/);
    if (attrContains) {
      const val = this.getAttribute(attrContains[1]);
      return val ? val.includes(attrContains[2]) : false;
    }

    // Attribute exact: [attr="val"]
    const attrExact = selector.match(/^\[([a-zA-Z0-9_-]+)="([^"]+)"\]$/);
    if (attrExact) {
      return this.getAttribute(attrExact[1]) === attrExact[2];
    }

    // Has attribute: [attr]
    const hasAttr = selector.match(/^\[([a-zA-Z0-9_-]+)\]$/);
    if (hasAttr) {
      return this.attributes.has(hasAttr[1]);
    }

    // Class: .classname
    if (selector.startsWith('.')) {
      const cls = selector.slice(1);
      const classAttr = this.getAttribute('class') || '';
      return classAttr.split(/\s+/).includes(cls);
    }

    // ID: #idname
    if (selector.startsWith('#')) {
      const id = selector.slice(1);
      return this.getAttribute('id') === id;
    }

    // Tag name
    return this.tagName === selector.toUpperCase();
  }

  querySelector(selector) {
    const list = this.querySelectorAll(selector);
    return list.length > 0 ? list[0] : null;
  }

  querySelectorAll(selector) {
    const results = [];
    selector = selector.trim();

    // Check for :scope > tag
    if (selector.startsWith(':scope >')) {
      const targetTag = selector.replace(':scope >', '').trim().toUpperCase();
      for (const child of this.childNodes) {
        if (child.nodeType === Node.ELEMENT_NODE && (targetTag === '*' || child.tagName === targetTag)) {
          results.push(child);
        }
      }
      return results;
    }

    // General selector traversal
    const traverse = (node) => {
      for (const child of node.childNodes) {
        if (child.nodeType === Node.ELEMENT_NODE) {
          if (child.matches(selector)) {
            results.push(child);
          }
          traverse(child);
        }
      }
    };

    traverse(this);
    return results;
  }

  cloneNode(deep = true) {
    const clone = new Element(this.tagName);
    for (const [k, v] of this.attributes.entries()) {
      clone.setAttribute(k, v);
    }
    clone.style = { ...this.style };
    clone.hidden = this.hidden;

    if (deep) {
      for (const child of this.childNodes) {
        const childClone = child.cloneNode(true);
        clone.appendChild(childClone);
      }
    }
    return clone;
  }
}

/**
 * Basic HTML parser to generate Element trees
 */
export function parseHtml(html) {
  const root = new Element('div');
  const stack = [root];

  // Regex matching tokens: open tag, close tag, comment, or text
  const tagRegex = /<!--[\s\S]*?-->|<\/([a-zA-Z0-9_-]+)>|<([a-zA-Z0-9_-]+)((?:\s+[^=>\s]+(?:=(?:"[^"]*"|'[^']*'|[^>\s]+))?)*)\s*(\/?)>|([^<]+)/g;

  const VOID_TAGS = new Set(['META', 'LINK', 'IMG', 'BR', 'HR', 'INPUT']);

  let match;
  while ((match = tagRegex.exec(html)) !== null) {
    const [full, closeTag, openTag, attrsString, selfClose, textContent] = match;

    if (full.startsWith('<!--')) {
      continue;
    }

    if (closeTag) {
      const upper = closeTag.toUpperCase();
      // Pop stack until matching tag
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i].tagName === upper) {
          stack.splice(i);
          break;
        }
      }
      continue;
    }

    if (openTag) {
      const el = new Element(openTag);
      if (attrsString) {
        const attrRegex = /([a-zA-Z0-9_-]+)(?:=(?:"([^"]*)"|'([^']*)'|([^>\s]+)))?/g;
        let attrMatch;
        while ((attrMatch = attrRegex.exec(attrsString)) !== null) {
          const attrName = attrMatch[1];
          const attrValue = attrMatch[2] ?? attrMatch[3] ?? attrMatch[4] ?? '';
          el.setAttribute(attrName, attrValue);
        }
      }

      stack[stack.length - 1].appendChild(el);

      if (!selfClose && !VOID_TAGS.has(el.tagName)) {
        stack.push(el);
      }
      continue;
    }

    if (textContent) {
      const text = textContent.replace(/\s+/g, ' ');
      if (text.trim() || textContent.includes(' ')) {
        stack[stack.length - 1].appendChild(new TextNode(textContent));
      }
    }
  }

  return root;
}

