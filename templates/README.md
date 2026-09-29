# Generator templates

Each template is a bufo whose held object has been replaced by a slot the
generator drops your image into.

| File | What it is |
| --- | --- |
| `<slug>.base.png` | drawn first, under the subject |
| `<slug>.overlay.png` | optional, drawn last — bufo's hands in front of the object |
| `templates.json` | slot geometry and naming pattern for each template |

The plates are derived from [knobiknows/all-the-bufo][atb] by
`scripts/build_template_plates.py`, which paints out the original object where
it sits on a flat background (the thought bubble, the sky) and otherwise relies
on a `cover` slot so the subject hides it completely. `templates.json` records
the source image for every plate.

Rebuild them from a fresh checkout with:

```sh
git clone --depth 1 https://github.com/knobiknows/all-the-bufo.git /tmp/atb
python3 scripts/build_template_plates.py /tmp/atb
```

To add a template without touching this directory, use the template editor at
`/admin` → Templates: upload a base plate, drag the slot rectangle, save. It
writes to D1 and R2 and shows up in the generator on the next manifest rebuild.

[atb]: https://github.com/knobiknows/all-the-bufo
