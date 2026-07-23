import React, {useEffect, useMemo, useRef, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import {format, startOfMonth} from 'date-fns';
import {getSetting, setSetting} from '../../db/settings';
import {getDateFnsLocale} from '../../i18n';
import {
  exportWorkReport,
} from '../../services/workReportExport';
import type {
  ReportLanguage,
  WorkReportType,
} from '../../services/workReport';
import {radius, spacing, typography, useTheme} from '../../theme';
import type {Colors} from '../../theme';
import {makeSettingsStyles} from './settingsStyles';

type Picker = 'start' | 'end' | null;

const REPORT_TYPES: Array<{
  value: WorkReportType;
  labelKey: string;
  accessibilityKey: string;
}> = [
  {
    value: 'hours',
    labelKey: 'reporting.typeHours',
    accessibilityKey: 'reporting.typeHoursAccessibility',
  },
  {
    value: 'headlines',
    labelKey: 'reporting.typeHeadlines',
    accessibilityKey: 'reporting.typeHeadlinesAccessibility',
  },
  {
    value: 'statistics',
    labelKey: 'reporting.typeStatistics',
    accessibilityKey: 'reporting.typeStatisticsAccessibility',
  },
];

const REPORT_ERROR_KEYS = {
  report_person_required: 'reporting.errorPersonRequired',
  report_company_required: 'reporting.errorCompanyRequired',
  report_invalid_range: 'reporting.errorInvalidRange',
  report_empty: 'reporting.errorEmpty',
  report_read_failed: 'reporting.errorReadFailed',
  report_render_failed: 'reporting.errorRenderFailed',
  report_save_failed: 'reporting.errorSaveFailed',
} as const;

const makeLocalStyles = (c: Colors) =>
  StyleSheet.create({
    field: {
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      backgroundColor: c.bgCard,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    label: {
      color: c.textPrimary,
      fontSize: typography.sizes.sm,
      fontWeight: typography.weights.medium,
      marginBottom: spacing.sm,
    },
    input: {
      minHeight: 48,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: radius.md,
      backgroundColor: c.bg,
      color: c.textPrimary,
      fontSize: typography.sizes.base,
    },
    dateRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      padding: spacing.lg,
      backgroundColor: c.bgCard,
    },
    dateButton: {
      flex: 1,
      minHeight: 52,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: radius.md,
      backgroundColor: c.bg,
      justifyContent: 'center',
    },
    dateLabel: {
      color: c.textMuted,
      fontSize: typography.sizes.xs,
      fontWeight: typography.weights.medium,
      marginBottom: 2,
    },
    dateValue: {
      color: c.textPrimary,
      fontSize: typography.sizes.sm,
      fontWeight: typography.weights.semibold,
    },
    dateSeparator: {
      color: c.textMuted,
      fontSize: typography.sizes.base,
    },
    selected: {
      color: c.primary,
      fontSize: typography.sizes.lg,
      marginLeft: spacing.md,
    },
    exportButton: {
      minHeight: 52,
      marginHorizontal: spacing.lg,
      marginTop: spacing.xl,
      paddingHorizontal: spacing.lg,
      borderRadius: radius.md,
      backgroundColor: c.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    exportButtonDisabled: {
      opacity: 0.45,
    },
    exportButtonText: {
      color: c.white,
      fontSize: typography.sizes.base,
      fontWeight: typography.weights.semibold,
    },
  });

export default function ReportingSettings() {
  const {t, i18n} = useTranslation();
  const {colors} = useTheme();
  const styles = useMemo(() => makeSettingsStyles(colors), [colors]);
  const local = useMemo(() => makeLocalStyles(colors), [colors]);

  const [personName, setPersonName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [startDate, setStartDate] = useState(() => startOfMonth(new Date()));
  const [endDate, setEndDate] = useState(() => new Date());
  const [language, setLanguage] = useState<ReportLanguage>('fi');
  const [type, setType] = useState<WorkReportType>('hours');
  const [picker, setPicker] = useState<Picker>(null);
  const [busy, setBusy] = useState(false);
  const identityDirty = useRef({person: false, company: false});
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    let active = true;
    Promise.all([
      getSetting('report_person_name'),
      getSetting('report_company_name'),
    ]).then(([savedPersonName, savedCompanyName]) => {
      if (!active) {
        return;
      }
      if (!identityDirty.current.person) {
        setPersonName(savedPersonName ?? '');
      }
      if (!identityDirty.current.company) {
        setCompanyName(savedCompanyName ?? '');
      }
    }).catch(() => {
      if (active) {
        Alert.alert(t('common.error'), t('reporting.errorLoadIdentity'));
      }
    });
    return () => {
      active = false;
      mounted.current = false;
    };
  }, [t]);

  const saveIdentity = async (
    key: 'report_person_name' | 'report_company_name',
    value: string,
    update: (trimmed: string) => void,
  ) => {
    const trimmed = value.trim();
    try {
      await setSetting(key, trimmed);
      if (mounted.current) {
        update(trimmed);
      }
    } catch {
      if (mounted.current) {
        Alert.alert(t('common.error'), t('reporting.errorSaveIdentity'));
      }
    }
  };

  const handleExport = async () => {
    if (busy) {
      return;
    }
    const reportT = i18n.getFixedT(language);
    if (startDate > endDate) {
      Alert.alert(
        reportT('common.error'),
        reportT('reporting.errorInvalidRange'),
      );
      return;
    }
    setBusy(true);
    try {
      await exportWorkReport({
        personName: personName.trim(),
        companyName: companyName.trim(),
        startDate: format(startDate, 'yyyy-MM-dd'),
        endDate: format(endDate, 'yyyy-MM-dd'),
        language,
        type,
      });
    } catch (error) {
      const code = error instanceof Error ? error.message : '';
      const errorKey =
        REPORT_ERROR_KEYS[code as keyof typeof REPORT_ERROR_KEYS]
        ?? 'settings.exportFailed';
      Alert.alert(reportT('common.error'), reportT(errorKey));
    } finally {
      if (mounted.current) {
        setBusy(false);
      }
    }
  };

  const dateLocale = getDateFnsLocale(
    i18n.resolvedLanguage === 'fi' ? 'fi' : 'en',
  );
  const startDateValue = format(startDate, 'PP', {locale: dateLocale});
  const endDateValue = format(endDate, 'PP', {locale: dateLocale});
  const exportDisabled =
    busy || startDate > endDate || !personName.trim() || !companyName.trim();

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled">
        <Text style={styles.sectionHeader}>{t('reporting.identity')}</Text>
        <View style={local.field}>
          <Text style={local.label}>{t('reporting.personName')}</Text>
          <TextInput
            style={local.input}
            value={personName}
            onChangeText={value => {
              identityDirty.current.person = true;
              setPersonName(value);
            }}
            onBlur={() =>
              saveIdentity(
                'report_person_name',
                personName,
                setPersonName,
              )
            }
            accessibilityLabel={t('reporting.personName')}
            placeholder={t('reporting.personNamePlaceholder')}
            placeholderTextColor={colors.textMuted}
            autoCapitalize="words"
          />
        </View>
        <View style={local.field}>
          <Text style={local.label}>{t('reporting.companyName')}</Text>
          <TextInput
            style={local.input}
            value={companyName}
            onChangeText={value => {
              identityDirty.current.company = true;
              setCompanyName(value);
            }}
            onBlur={() =>
              saveIdentity(
                'report_company_name',
                companyName,
                setCompanyName,
              )
            }
            accessibilityLabel={t('reporting.companyName')}
            placeholder={t('reporting.companyNamePlaceholder')}
            placeholderTextColor={colors.textMuted}
            autoCapitalize="words"
          />
        </View>

        <Text style={styles.sectionHeader}>{t('reporting.dateRange')}</Text>
        <View style={local.dateRow}>
          <TouchableOpacity
            style={local.dateButton}
            onPress={() => setPicker('start')}
            accessibilityRole="button"
            accessibilityLabel={t('reporting.startDateAccessibility')}
            accessibilityValue={{text: startDateValue}}>
            <Text style={local.dateLabel}>{t('common.from')}</Text>
            <Text style={local.dateValue}>{startDateValue}</Text>
          </TouchableOpacity>
          <Text style={local.dateSeparator}>→</Text>
          <TouchableOpacity
            style={local.dateButton}
            onPress={() => setPicker('end')}
            accessibilityRole="button"
            accessibilityLabel={t('reporting.endDateAccessibility')}
            accessibilityValue={{text: endDateValue}}>
            <Text style={local.dateLabel}>{t('common.to')}</Text>
            <Text style={local.dateValue}>{endDateValue}</Text>
          </TouchableOpacity>
        </View>

        {picker && (
          <DateTimePicker
            value={picker === 'start' ? startDate : endDate}
            mode="date"
            display={Platform.OS === 'android' ? 'default' : 'spinner'}
            maximumDate={picker === 'start' ? endDate : undefined}
            minimumDate={picker === 'end' ? startDate : undefined}
            onChange={(_event, selectedDate) => {
              if (selectedDate) {
                if (picker === 'start') {
                  setStartDate(selectedDate);
                } else {
                  setEndDate(selectedDate);
                }
              }
              setPicker(null);
            }}
          />
        )}

        <Text style={styles.sectionHeader}>{t('reporting.language')}</Text>
        {([
          ['fi', 'reporting.languageFi', 'reporting.languageFiAccessibility'],
          ['en', 'reporting.languageEn', 'reporting.languageEnAccessibility'],
        ] as const).map(([value, labelKey, accessibilityKey]) => (
          <TouchableOpacity
            key={value}
            style={styles.row}
            onPress={() => setLanguage(value)}
            accessibilityRole="radio"
            accessibilityState={{checked: language === value}}
            accessibilityLabel={t(accessibilityKey)}>
            <Text style={styles.rowLabel}>{t(labelKey)}</Text>
            {language === value && <Text style={local.selected}>●</Text>}
          </TouchableOpacity>
        ))}

        <Text style={styles.sectionHeader}>{t('reporting.type')}</Text>
        {REPORT_TYPES.map(option => (
          <TouchableOpacity
            key={option.value}
            style={styles.row}
            onPress={() => setType(option.value)}
            accessibilityRole="radio"
            accessibilityState={{checked: type === option.value}}
            accessibilityLabel={t(option.accessibilityKey)}>
            <Text style={styles.rowLabel}>{t(option.labelKey)}</Text>
            {type === option.value && <Text style={local.selected}>●</Text>}
          </TouchableOpacity>
        ))}

        <TouchableOpacity
          style={[
            local.exportButton,
            exportDisabled && local.exportButtonDisabled,
          ]}
          onPress={handleExport}
          disabled={exportDisabled}
          accessibilityRole="button"
          accessibilityState={{disabled: exportDisabled, busy}}
          accessibilityLabel={t(
            busy ? 'reporting.exporting' : 'reporting.export',
          )}>
          <Text style={local.exportButtonText}>
            {busy ? t('reporting.exporting') : t('reporting.export')}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
