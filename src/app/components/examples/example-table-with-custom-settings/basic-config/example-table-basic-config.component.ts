import { Component } from '@angular/core';
import { BasicWidgetConfigComponent } from '@home/components/public-api';
import { FormBuilder, FormGroup } from '@angular/forms';
import { WidgetConfigComponentData } from '@home/models/widget-component.models';
import { AppState } from '@core/public-api';
import { Store } from '@ngrx/store';
import { WidgetConfigComponent } from '@home/components/widget/widget-config.component';
import { DataKey, Datasource } from '@shared/public-api';

@Component({
    selector: 'tb-example-table-basic-config',
    templateUrl: './example-table-basic-config.component.html',
    styleUrls: []
})

export class ExampleTableBasicConfigComponent extends BasicWidgetConfigComponent {

    public exampleTableConfigForm: FormGroup;
    public basicMode = this.basicMode;

    public get datasource(): Datasource | null {
        const datasources: Datasource[] = this.exampleTableConfigForm.get('datasources').value;
        if (datasources && datasources.length) {
            return datasources[0];
        } else {
            return null;
        }
    }

    constructor(protected store: Store<AppState>,
                protected widgetConfigComponent: WidgetConfigComponent,
                private fb: FormBuilder) {
        super(store, widgetConfigComponent);
    }

    protected configForm(): FormGroup {
        return this.exampleTableConfigForm;
    }

    protected onConfigSet(configData: WidgetConfigComponentData): void {
        this.exampleTableConfigForm = this.fb.group({
            datasources: [configData.config.datasources, []],
            columns: [this.getColumns(configData.config.datasources), []],
            actions: [configData.config.actions || {}, []]
        });
    }

    protected prepareOutputConfig(config: any): WidgetConfigComponentData {
        this.widgetConfig.config.datasources = config.datasources;
        this.widgetConfig.config.actions = config.actions;
        this.setColumns(config.columns, this.widgetConfig.config.datasources);
        return this.widgetConfig;
    }

    private getColumns(datasources?: Datasource[]): DataKey[] {
        if (datasources && datasources.length) {
            return datasources[0].dataKeys || [];
        }
        return [];
    }



    private setColumns(columns: DataKey[], datasources?: Datasource[]) {
        if (datasources && datasources.length) {
            datasources[0].dataKeys = columns;
        }
    }

}
