import { SCHEDULE_HISTORIES, type ScheduleHistory } from '@/entities/schedule';
import { Field, FieldLabel } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select';

const HISTORY_LABELS: Record<ScheduleHistory, string> = {
  none: 'This tick only',
  last: 'Last N runs',
  all: 'All scheduled runs',
};

export function ScheduleHistoryFields({
  history,
  historyLast,
  onHistory,
  onHistoryLast,
}: {
  history: ScheduleHistory;
  historyLast: number;
  onHistory: (history: ScheduleHistory) => void;
  onHistoryLast: (historyLast: number) => void;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field>
        <FieldLabel htmlFor="schedule-history">History in the model</FieldLabel>
        <Select
          items={SCHEDULE_HISTORIES.map((item) => ({
            value: item,
            label: HISTORY_LABELS[item],
          }))}
          value={history}
          onValueChange={(value) => {
            if (value === 'none' || value === 'last' || value === 'all') {
              onHistory(value);
            }
          }}
        >
          <SelectTrigger id="schedule-history" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {SCHEDULE_HISTORIES.map((item) => (
                <SelectItem key={item} value={item}>
                  {HISTORY_LABELS[item]}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>
      {history === 'last' ? (
        <Field>
          <FieldLabel htmlFor="schedule-history-last">Runs</FieldLabel>
          <Input
            id="schedule-history-last"
            type="number"
            min={1}
            max={99}
            value={historyLast}
            onChange={(event) => {
              const next = Number(event.target.value);
              if (!Number.isFinite(next)) {
                return;
              }
              onHistoryLast(Math.min(99, Math.max(1, Math.floor(next))));
            }}
          />
        </Field>
      ) : null}
    </div>
  );
}
