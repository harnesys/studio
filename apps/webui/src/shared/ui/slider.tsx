import { Slider as SliderPrimitive } from '@base-ui/react/slider';

import { cn } from '@/shared/lib/utils';

function Slider({
  className,
  defaultValue,
  value,
  min = 0,
  max = 100,
  ...props
}: SliderPrimitive.Root.Props) {
  let _values: number[];
  if (Array.isArray(value)) {
    _values = value;
  } else if (typeof value === 'number') {
    _values = [value];
  } else if (Array.isArray(defaultValue)) {
    _values = defaultValue;
  } else if (typeof defaultValue === 'number') {
    _values = [defaultValue];
  } else {
    _values = [min, max];
  }

  return (
    <SliderPrimitive.Root
      className={cn('data-vertical:h-full data-horizontal:w-full', className)}
      data-slot="slider"
      defaultValue={defaultValue}
      value={value}
      min={min}
      max={max}
      thumbAlignment="edge"
      {...props}
    >
      <SliderPrimitive.Control className="relative flex w-full touch-none select-none items-center data-vertical:h-full data-vertical:min-h-40 data-vertical:w-auto data-vertical:flex-col data-disabled:opacity-50">
        <SliderPrimitive.Track
          data-slot="slider-track"
          className="relative grow select-none overflow-hidden rounded-full bg-muted data-horizontal:h-1 data-vertical:h-full data-horizontal:w-full data-vertical:w-1"
        >
          <SliderPrimitive.Indicator
            data-slot="slider-range"
            className="select-none bg-live data-horizontal:h-full data-vertical:w-full"
          />
        </SliderPrimitive.Track>
        {Array.from({ length: _values.length }, (_, index) => (
          <SliderPrimitive.Thumb
            data-slot="slider-thumb"
            // Thumb identity is its position in a fixed-length control.
            // biome-ignore lint/suspicious/noArrayIndexKey: slider thumbs are positional
            key={index}
            className="relative block size-3 shrink-0 select-none rounded-full border border-live bg-live ring-live/30 transition-[color,box-shadow] after:absolute after:-inset-2 hover:ring-3 focus-visible:outline-hidden focus-visible:ring-3 active:ring-3 disabled:pointer-events-none disabled:opacity-50"
          />
        ))}
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  );
}

export { Slider };
