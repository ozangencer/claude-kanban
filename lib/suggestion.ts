import { ReactRenderer } from "@tiptap/react";
import tippy, { Instance, Props } from "tippy.js";
import { MentionPopup, MentionPopupRef, MentionItem } from "@/components/ui/mention-popup";
import { SuggestionOptions, SuggestionProps } from "@tiptap/suggestion";

interface SuggestionConfig {
  char: string;
  items: string[];
  prefix: string;
  nodeType: string;
}

export function createSuggestion(config: SuggestionConfig): Omit<SuggestionOptions<MentionItem>, 'editor'> {
  return {
    char: config.char,
    allowSpaces: false,
    startOfLine: false,

    items: ({ query }) => {
      return config.items
        .filter((item) =>
          item.toLowerCase().includes(query.toLowerCase())
        )
        .slice(0, 10)
        .map((item) => ({
          id: item,
          label: item,
          prefix: config.prefix,
        }));
    },

    command: ({ editor, range, props }) => {
      editor
        .chain()
        .focus()
        .insertContentAt(range, [
          {
            type: config.nodeType,
            attrs: {
              id: props.id,
              label: props.label,
            },
          },
        ])
        .run();
    },

    render: () => {
      let component: ReactRenderer<MentionPopupRef>;
      let popup: Instance<Props>[];

      return {
        onStart: (props: SuggestionProps<MentionItem>) => {
          component = new ReactRenderer(MentionPopup, {
            props: {
              items: props.items,
              command: props.command,
            },
            editor: props.editor,
          });

          if (!props.clientRect) {
            return;
          }

          popup = tippy("body", {
            getReferenceClientRect: props.clientRect as () => DOMRect,
            appendTo: () => document.body,
            content: component.element,
            showOnCreate: true,
            interactive: true,
            trigger: "manual",
            placement: "bottom-start",
          });
        },

        onUpdate(props: SuggestionProps<MentionItem>) {
          component.updateProps({
            items: props.items,
            command: props.command,
          });

          if (!props.clientRect) {
            return;
          }

          popup[0].setProps({
            getReferenceClientRect: props.clientRect as () => DOMRect,
          });
        },

        onKeyDown(props: { event: KeyboardEvent }) {
          if (props.event.key === "Escape") {
            popup[0].hide();
            return true;
          }

          return component.ref?.onKeyDown(props.event) ?? false;
        },

        onExit() {
          popup[0].destroy();
          component.destroy();
        },
      };
    },
  };
}
