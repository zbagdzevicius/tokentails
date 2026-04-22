import * as React from 'react';

import { Editor } from '@tinymce/tinymce-react';

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

const TextArea = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, value, onChange, ...props }, ref) => {
    return (
      <div className="z-0 relative">
        <Editor
          apiKey="9hua2qkvmziyi5n04hffwamx9ke7tkchx9o5k37o54e9s2uk"
          value={value as string}
          onEditorChange={(a) => onChange!({ target: { value: a } } as any)}
          init={{
            height: 300,
            menubar: false,
            placeholder: props.placeholder || 'Type here...',
            plugins: [
              'advlist',
              'autolink',
              'lists',
              'link',
              'image',
              'charmap',
              'preview',
              'anchor',
              'searchreplace',
              'visualblocks',
              'fullscreen',
              'insertdatetime',
              'table',
              'help',
              'wordcount'
            ],
            toolbar:
              'undo redo | blocks | ' +
              'bold italic forecolor | alignleft aligncenter ' +
              'alignright alignjustify | bullist numlist outdent indent | ' +
              'removeformat | help',
            content_style:
              'body { font-family:Helvetica,Arial,sans-serif; font-size:14px }'
          }}
        />
      </div>
    );
  }
);
TextArea.displayName = 'TextArea';

export { TextArea };
