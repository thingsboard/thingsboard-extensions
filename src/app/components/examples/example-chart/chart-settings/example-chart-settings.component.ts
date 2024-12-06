import { Component } from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';
import { AppState } from '@core/public-api';
import { Store } from '@ngrx/store';
import { LegendPosition, WidgetSettings, WidgetSettingsComponent } from '@shared/public-api';

@Component({
  selector: 'tb-example-chart-settings',
  templateUrl: './example-chart-settings.component.html',
  styleUrls: []
})

export class ExampleChartSettingsComponent extends WidgetSettingsComponent {

  public exampleTableConfigForm: FormGroup;

  constructor(protected store: Store<AppState>,
              private fb: FormBuilder) {
    super(store);
  }

  protected defaultSettings(): WidgetSettings {
    return {
      showLegend: true,
      legendConfig: {
        position: LegendPosition.top,
        sortDataKeys: true,
        showMin: true,
        showMax: true,
        showAvg: true,
        showTotal: true,
        showLatest: true
      }
    };
  }

  protected onSettingsSet(settings: WidgetSettings): any {
    this.exampleTableConfigForm = this.fb.group({
      showLegend: [settings.showLegend, []],
      legendConfig: [settings.legendConfig, []]
    });
  }
  protected settingsForm(): FormGroup {
    return this.exampleTableConfigForm;
  }
}
