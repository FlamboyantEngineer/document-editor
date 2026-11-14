import { Button } from '@flamboyantengineer/ui-components/button';
import { DropdownMenu } from '@flamboyantengineer/ui-components/dropdown-menu';
import { Cluster } from '@flamboyantengineer/ui-components/layout';
import { Switch } from '@flamboyantengineer/ui-components/switch';
import type { RevisionLabels } from './revision-labels.js';

interface RevisionToolbarProps {
  showFilters: boolean;
  namedOnly: boolean;
  onNamedOnlyChange: (value: boolean) => void;
  person: string | null;
  onPersonChange: (value: string | null) => void;
  people: string[];
  labels: RevisionLabels;
  onCompare: (() => void) | undefined;
  canCompare: boolean;
}

/** Revision filters and comparison controls, outside the selectable collection. */
export function RevisionToolbar(props: RevisionToolbarProps) {
  const { labels } = props;
  return (
    <Cluster space="sm">
      {props.showFilters ? (
        <>
          <Switch size="sm" isSelected={props.namedOnly} onChange={props.onNamedOnlyChange}>
            {labels.namedRevisionsOnly}
          </Switch>
          <DropdownMenu
            label={labels.revisionsBy(props.person)}
            size="sm"
            variant="ghost"
            items={[
              { id: '', label: labels.anyRevisionAuthor },
              ...props.people.map((name) => ({ id: name, label: name })),
            ]}
            selectionMode="single"
            selectedKeys={[props.person ?? '']}
            disallowEmptySelection
            onSelectionChange={(keys) => {
              if (keys !== 'all') props.onPersonChange(String([...keys][0] ?? '') || null);
            }}
          />
        </>
      ) : null}
      {props.onCompare ? (
        <Button size="sm" isDisabled={!props.canCompare} onPress={props.onCompare}>
          {labels.compareRevisions}
        </Button>
      ) : null}
    </Cluster>
  );
}
