import { Plugin } from "prosemirror-state";
import { InputRule } from "prosemirror-inputrules";
import getDataTransferFiles from "../lib/getDataTransferFiles";
import uploadPlaceholderPlugin from "../lib/uploadPlaceholder";
import insertFiles from "../commands/insertFiles";
import Node from "./Node";

/**
 * Matches following attributes in Markdown-typed image: [, alt, src, title]
 *
 * Example:
 * ![Lorem](image.jpg) -> [, "Lorem", "image.jpg"]
 * ![](image.jpg "Ipsum") -> [, "", "image.jpg", "Ipsum"]
 * ![Lorem](image.jpg "Ipsum") -> [, "Lorem", "image.jpg", "Ipsum"]
 */
const IMAGE_INPUT_REGEX = /!\[(.+|:?)]\((\S+)(?:(?:\s+)["'](\S+)["'])?\)/;

const uploadPlugin = options =>
  new Plugin({
    props: {
      handleDOMEvents: {
        paste(view, event: ClipboardEvent): boolean {
          if (!view.props.editable) return false;

          // check if we actually pasted any files
          const files = Array.prototype.slice
            .call(event.clipboardData.items)
            .map(dt => dt.getAsFile())
            .filter(file => file);

          if (files.length === 0) return false;

          const { tr } = view.state;
          if (!tr.selection.empty) {
            tr.deleteSelection();
          }
          const pos = tr.selection.from;

          insertFiles(view, event, pos, files, options);
          return true;
        },
        drop(view, event: DragEvent): boolean {
          if (!view.props.editable) return false;

          // check if we actually dropped any files
          const files = getDataTransferFiles(event);
          if (files.length === 0) return false;

          // grab the position in the document for the cursor
          const { pos } = view.posAtCoords({
            left: event.clientX,
            top: event.clientY,
          });

          insertFiles(view, event, pos, files, options);
          return true;
        },
      },
    },
  });

export default class Image extends Node {
  get name() {
    return "image";
  }

  get schema() {
    return {
      inline: true,
      attrs: {
        src: {},
        alt: {
          default: null,
        },
      },
      content: "text*",
      marks: "",
      group: "inline",
      draggable: true,
      parseDOM: [
        {
          tag: "div[class=image]",
          getAttrs: (dom: HTMLElement) => {
            const img = dom.getElementsByTagName("img")[0];
            const caption = dom.getElementsByTagName("p")[0];

            return {
              src: img.getAttribute("src"),
              alt: caption.innerText,
            };
          },
        },
      ],
      toDOM: node => {
        return [
          "div",
          {
            class: "image",
          },
          ["img", node.attrs],
          ["p", { class: "caption" }, 0],
        ];
      },
    };
  }

  toMarkdown(state, node) {
    state.write(
      "![" +
        state.esc(node.textContent || "") +
        "](" +
        state.esc(node.attrs.src) +
        ")"
    );
  }

  parseMarkdown() {
    return {
      node: "image",
      getAttrs: token => ({
        src: token.attrGet("src"),
        alt: (token.children[0] && token.children[0].content) || null,
      }),
    };
  }

  commands({ type }) {
    return attrs => (state, dispatch) => {
      const { selection } = state;
      const position = selection.$cursor
        ? selection.$cursor.pos
        : selection.$to.pos;
      const node = type.create(attrs);
      const transaction = state.tr.insert(position, node);
      dispatch(transaction);
    };
  }

  inputRules({ type }) {
    return [
      new InputRule(IMAGE_INPUT_REGEX, (state, match, start, end) => {
        const [okay, alt, src] = match;
        const { tr } = state;

        if (okay) {
          tr.replaceWith(
            start - 1,
            end,
            type.create({
              src,
              alt,
            })
          );
        }

        return tr;
      }),
    ];
  }

  get plugins() {
    return [uploadPlaceholderPlugin, uploadPlugin(this.options)];
  }
}
