import { Editor } from '@tinymce/tinymce-react';

export interface TextAreaProps {
  value?: string;
  placeholder?: string;
  // Accepted for parity with Input; the rich-text editor styles itself.
  className?: string;
  // Mirrors the shape of an input change event so callers can read
  // e.target.value, as they do for Input.
  onChange: (event: { target: { value: string } }) => void;
}

const TextArea = ({ value, placeholder, onChange }: TextAreaProps) => {
  return (
    <div className="z-0 relative">
      <Editor
        apiKey="9hua2qkvmziyi5n04hffwamx9ke7tkchx9o5k37o54e9s2uk"
        value={value}
        onEditorChange={(a) => onChange({ target: { value: a } })}
        init={{
          height: 300,
          menubar: false,
          placeholder: placeholder || 'Type here...',
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
};

export { TextArea };
